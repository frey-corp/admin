// =========================
// SUPABASE CONFIG
// =========================
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://nqhggfqdjxawvxchbqdu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uFul_JGxo6iQJ8bVWb3YwQ_kmbWDvrI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// GLOBAL
// =========================
let currentUser = null;
let dealModal = null;

// =========================
// UTIL NUMBER FORMAT (FIX FINAL)
// =========================
function formatNumber(val) {
  if (!val || isNaN(val)) return "";
  return Number(val).toLocaleString("id-ID");
}

function parseNumber(val) {
  if (!val) return 0;
  return Number(val.toString().replace(/[^\d]/g, ""));
}

function today() {
  return new Date().toISOString().split("T")[0];
}

// =========================
// DOCUMENT READY
// =========================
$(document).ready(() => {

  dealModal = new bootstrap.Modal(document.getElementById("dealModal"), {
    backdrop: "static",
    keyboard: true
  });

  const loginModal = new bootstrap.Modal(document.getElementById("loginModal"), {
    backdrop: "static",
    keyboard: false
  });
  loginModal.show();

  $("#loginBtn").click(login);
});

// =========================
// LOGIN
// =========================
async function login() {
  const username = $("#username").val().trim();
  const password = $("#password").val().trim();

  if (!username || !password) {
    Swal.fire("Error", "Username & Password wajib diisi", "error");
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .eq("role", 2)
    .single();

  if (error || !data) {
    Swal.fire("Error", "Admin tidak ditemukan", "error");
    return;
  }

  if (password !== data.password_hash) {
    Swal.fire("Error", "Password salah", "error");
    return;
  }

  currentUser = data;
  $("#loginModal").modal("hide");
  $("#dashboard").removeClass("d-none");

  await loadMaster();
  await loadDeals();
}

// =========================
// LOAD MASTER DATA
// =========================
async function loadMaster() {

  // ===== KOL
  const { data: kolMap } = await supabase
    .from("admin_kol_mapping")
    .select(`
      kol_user_id,
      kol:kol_user_id (
        id,
        full_name
      )
    `)
    .eq("admin_user_id", currentUser.id);

  $("#kolSelect").empty().append(`<option value=""></option>`);
  $("#filterKOL").empty().append(`<option value="">ALL</option>`);

  kolMap.forEach(k => {
    if (k.kol) {
      $("#kolSelect").append(
        `<option value="${k.kol.id}">${k.kol.full_name}</option>`
      );
      $("#filterKOL").append(
        `<option value="${k.kol.id}">${k.kol.full_name}</option>`
      );
    }
  });

  $("#kolSelect").select2({
    width: "100%",
    placeholder: "Pilih KOL",
    allowClear: true,
    dropdownParent: $("#dealModal")
  });

  $("#filterKOL").select2({
    width: "100%",
    placeholder: "All KOL",
    allowClear: true
  });

  // ===== BRAND
  const { data: brands } = await supabase.from("brands").select("*");

  $("#brandSelect").empty().append(`<option value=""></option>`);
  brands.forEach(b => {
    $("#brandSelect").append(
      `<option value="${b.id}">${b.brand_name}</option>`
    );
  });

  $("#brandSelect").select2({
    width: "100%",
    placeholder: "Pilih Brand",
    allowClear: true,
    dropdownParent: $("#dealModal")
  });

  // ===== DEFAULT FILTER DATE
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  $("#filterDateFrom").val(from.toISOString().split("T")[0]);
  $("#filterDateTo").val(today());
}

// =========================
// LOAD DEALS
// =========================
async function loadDeals() {

  let query = supabase
    .from("deals")
    .select(`
      id,
      deal_date,
      job_description,
      deadline,
      amount_dealing,
      status,
      kol:kol_user_id(full_name),
      brand:brand_id(brand_name)
    `)
    .gte("deal_date", $("#filterDateFrom").val())
    .lte("deal_date", $("#filterDateTo").val())
    .order("deal_date", { ascending: false });

  if ($("#filterKOL").val())
    query = query.eq("kol_user_id", $("#filterKOL").val());

  if ($("#filterStatus").val())
    query = query.eq("status", $("#filterStatus").val());

  const { data } = await query;

  if ($.fn.DataTable.isDataTable("#dealsTable"))
    $("#dealsTable").DataTable().destroy();

  $("#dealsTable tbody").empty();

  data.forEach(d => {
    $("#dealsTable tbody").append(`
      <tr>
        <td>${d.deal_date}</td>
        <td>${d.brand.brand_name}</td>
        <td>${d.kol.full_name}</td>
        <td>${d.job_description}</td>
        <td>${d.deadline || ""}</td>
        <td>Rp ${formatNumber(d.amount_dealing)}</td>
        <td>${d.status}</td>
        <td>
          ${d.status === "ON_PROGRESS" ? `
            <button class="btn btn-sm btn-primary editDealBtn" data-id="${d.id}">
              Edit
            </button>
          ` : ``}
          <button class="btn btn-sm btn-secondary printInvoiceBtn" data-id="${d.id}">
            Print
          </button>
        </td>
      </tr>
    `);
  });

  $("#dealsTable").DataTable({ responsive: true });
}

// =========================
// FILTER CHANGE
// =========================
$("#filterDateFrom, #filterDateTo, #filterKOL, #filterStatus")
  .on("change", loadDeals);

// =========================
// ADD DEAL
// =========================
$("#addDealBtn").click(() => {
  $("#dealForm")[0].reset();
  $("#dealForm").removeData("id");

  $("#dealDate").val(today());
  $("#statusSelect").val("ON_PROGRESS");

  $("#brandSelect, #kolSelect").val(null).trigger("change");
  $("#adminFee, #agencyFee, #kolFee").val("");

  dealModal.show();
});

// =========================
// AUTO CALC (FIX FINAL – AMAN TYPE TEXT)
// =========================
$("#amountDealing").on("input", function () {

  const rawAmount = parseNumber(this.value);

  if (!rawAmount) {
    $("#adminFee, #agencyFee, #kolFee").val("");
    return;
  }

  const admin = Math.round(rawAmount * 0.15);
  const agency = Math.round(rawAmount * 0.05);
  const kol = rawAmount - admin - agency;

  this.value = formatNumber(rawAmount);
  $("#adminFee").val(formatNumber(admin));
  $("#agencyFee").val(formatNumber(agency));
  $("#kolFee").val(formatNumber(kol));
});

// =========================
// SAVE DEAL
// =========================
$("#dealForm").submit(async e => {
  e.preventDefault();

  if ($("#statusSelect").val() === "FINISH" && !$("#transferDate").val()) {
    Swal.fire("Error", "Status FINISH wajib isi Tanggal Transfer", "error");
    return;
  }

  const payload = {
    deal_date: $("#dealDate").val(),
    brand_id: Number($("#brandSelect").val()),
    kol_user_id: $("#kolSelect").val(),
    admin_user_id: currentUser.id,
    job_description: $("#jobDesc").val(),
    deadline: $("#deadline").val() || null,
    amount_dealing: parseNumber($("#amountDealing").val()),
    admin_fee: parseNumber($("#adminFee").val()),
    agency_fee: parseNumber($("#agencyFee").val()),
    kol_fee: parseNumber($("#kolFee").val()),
    brief_sow: $("#briefSow").val() || null,
    content_link: $("#contentLink").val() || null,
    transfer_date: $("#transferDate").val() || null,
    status: $("#statusSelect").val()
  };

  const id = $("#dealForm").data("id");

  Swal.fire({ title: "Saving...", didOpen: () => Swal.showLoading() });

  const query = id
    ? supabase.from("deals").update(payload).eq("id", id)
    : supabase.from("deals").insert([payload]);

  const { error } = await query;
  Swal.close();

  if (error) {
    Swal.fire("Error", "Gagal menyimpan data", "error");
    return;
  }

  Swal.fire("Success", "Data berhasil disimpan", "success");
  dealModal.hide();
  loadDeals();
});

// =========================
// EDIT DEAL
// =========================
$(document).on("click", ".editDealBtn", async function () {

  const id = $(this).data("id");

  const { data } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .single();

  $("#dealForm").data("id", id);

  $("#dealDate").val(data.deal_date);
  $("#brandSelect").val(data.brand_id).trigger("change");
  $("#kolSelect").val(data.kol_user_id).trigger("change");
  $("#jobDesc").val(data.job_description);
  $("#deadline").val(data.deadline);
  $("#amountDealing").val(formatNumber(data.amount_dealing));
  $("#adminFee").val(formatNumber(data.admin_fee));
  $("#agencyFee").val(formatNumber(data.agency_fee));
  $("#kolFee").val(formatNumber(data.kol_fee));
  $("#briefSow").val(data.brief_sow);
  $("#contentLink").val(data.content_link);
  $("#transferDate").val(data.transfer_date);
  $("#statusSelect").val(data.status);

  dealModal.show();
});

// =========================
// PRINT INVOICE (SEMUA STATUS)
// =========================
$(document).on("click", ".printInvoiceBtn", async function () {

  const id = $(this).data("id");

  const { data: deal } = await supabase
    .from("deals")
    .select("deal_date, job_description, amount_dealing, kol_user_id, brand_id")
    .eq("id", id)
    .single();

  const { data: brand } = await supabase
    .from("brands")
    .select("brand_name")
    .eq("id", deal.brand_id)
    .single();

  const { data: kol } = await supabase
    .from("users")
    .select(`
      full_name,
      instagram_account,
      tiktok_account,
      whatsapp_number,
      bank_name,
      bank_account_number
    `)
    .eq("id", deal.kol_user_id)
    .single();

  generateInvoicePDF({
    deal_date: deal.deal_date,
    brand: brand?.brand_name,
    kol: kol.full_name,
    job: deal.job_description,
    amount: deal.amount_dealing,
    instagram: kol.instagram_account,
    tiktok: kol.tiktok_account,
    whatsapp: kol.whatsapp_number,
    bank: kol.bank_name,
    rekening: kol.bank_account_number
  });
});

// =========================
// PDF INVOICE
// =========================
function generateInvoicePDF(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let y = 20;
  doc.setFontSize(16);
  doc.text("INVOICE DEAL KOL", 105, y, { align: "center" });

  y += 15;
  doc.setFontSize(11);

  const row = (l, v) => {
    doc.text(l, 20, y);
    doc.text(":", 70, y);
    doc.text(String(v || "-"), 75, y);
    y += 8;
  };

  row("Date Deal", d.deal_date);
  row("Brand", d.brand);
  row("KOL", d.kol);
  row("Job Description", d.job);
  row("Amount", "Rp " + formatNumber(d.amount));

  y += 5;
  doc.line(20, y, 190, y);
  y += 10;

  row("Instagram", d.instagram);
  row("TikTok", d.tiktok);
  row("WhatsApp", d.whatsapp);
  row("Bank", d.bank);
  row("No Rekening", d.rekening);

  doc.save(`Invoice_${d.brand}_${d.kol}.pdf`);
}
