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
// UTIL
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

  // Type promote change
  $("input[name='typePromote']").on("change", handleTypePromote);

  // Realtime KOL fee calculation
  $("#amountDealing, #adminFee, #adminFee2, #agencyFee")
    .on("input", calculateKolFee);

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

  $("#welcomeText").text(`Welcome, ${data.full_name} - Frey Corp`);

  $("#loginModal").modal("hide");
  $("#dashboard").removeClass("d-none");

  await loadMaster();
  await loadDeals();
}

// =========================
// TYPE PROMOTE HANDLER
// =========================
function handleTypePromote() {
  const type = $("input[name='typePromote']:checked").val();

  if (type === "PAID") {
    $("#amountWrapper").show();
    $("#kolFeeWrapper").show();
  } else {
    $("#amountWrapper").hide();
    $("#kolFeeWrapper").hide();
    $("#amountDealing").val("");
    $("#kolFee").val("");
  }
}

$("#amountDealing, #adminFee, #adminFee2, #agencyFee").on("input", function () {
  
  let cursorPos = this.selectionStart;
  let value = $(this).val().replace(/\./g, "");
  
  if (!value) {
    $(this).val("");
    calculateKolFee();
    return;
  }

  let formatted = formatNumber(parseInt(value));
  $(this).val(formatted);

  calculateKolFee();
});


// =========================
// KOL FEE CALCULATION
// =========================
function calculateKolFee() {

  const type = $("input[name='typePromote']:checked").val();
  if (type !== "PAID") {
    $("#kolFee").val("");
    return;
  }

  const amount = parseNumber($("#amountDealing").val());
  const admin1 = parseNumber($("#adminFee").val());
  const admin2 = parseNumber($("#adminFee2").val());
  const agency = parseNumber($("#agencyFee").val());

  if (!amount) {
    $("#kolFee").val("");
    return;
  }

  const kol = amount - admin1 - admin2 - agency;

  $("#kolFee").val(formatNumber(kol < 0 ? 0 : kol));
}


// =========================
// LOAD MASTER
// =========================
async function loadMaster() {

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
      $("#kolSelect").append(`<option value="${k.kol.id}">${k.kol.full_name}</option>`);
      $("#filterKOL").append(`<option value="${k.kol.id}">${k.kol.full_name}</option>`);
    }
  });

  $("#kolSelect").select2({
    width: "100%",
    dropdownParent: $("#dealModal")
  });

  $("#filterKOL").select2({ width: "100%" });

  const { data: brands } = await supabase.from("brands").select("*");

  $("#brandSelect").empty().append(`<option value=""></option>`);
  brands.forEach(b => {
    $("#brandSelect").append(`<option value="${b.id}">${b.brand_name}</option>`);
  });

  $("#brandSelect").select2({
    width: "100%",
    dropdownParent: $("#dealModal")
  });

  const from = new Date();
  from.setMonth(from.getMonth() - 3);

  $("#filterDateFrom").val(from.toISOString().split("T")[0]);
  $("#filterDateTo").val(today());
}

// =========================
// LOAD DEALS
// =========================
async function loadDeals() {
  try {

    let query = supabase
      .from("deals")
      .select(`
        *,
        kol:kol_user_id(full_name),
        brand:brand_id(brand_name),
        admin:admin_user_id(full_name, alamat)
      `)
      .order("deal_date", { ascending: false })
      .range(0, 10000); // ambil banyak data

    const { data, error } = await query;

    if (error) {
      console.error(error);
      alert("Gagal load data");
      return;
    }

    if ($.fn.DataTable.isDataTable("#dealsTable")) {
      $("#dealsTable").DataTable().destroy();
    }

    $("#dealsTable tbody").empty();

    if (!data || data.length === 0) {
      $("#dealsTable tbody").append(`
        <tr>
          <td colspan="21" class="text-center">No Data</td>
        </tr>
      `);
    } else {

      data.forEach(d => {

        $("#dealsTable tbody").append(`
          <tr>
            <td>${d.deal_date || ""}</td>
            <td>${d.brand?.brand_name || ""}</td>
            <td>${d.kol?.full_name || ""}</td>
            <td>${d.admin?.full_name || ""}</td>
            <td>${d.job_description || ""}</td>
            <td>${d.deadline || ""}</td>
            <td>${d.type_promote === "PAID" ? "Rp " + formatNumber(d.amount_dealing) : "-"}</td>
            <td>${d.admin_fee != null ? "Rp " + formatNumber(d.admin_fee) : "-"}</td>
            <td>${d.admin_fee_2 != null ? "Rp " + formatNumber(d.admin_fee_2) : "-"}</td>
            <td>${d.agency_fee != null ? "Rp " + formatNumber(d.agency_fee) : "-"}</td>
            <td>${d.kol_fee != null ? "Rp " + formatNumber(d.kol_fee) : "-"}</td>
            <td>${d.brief_sow || ""}</td>
            <td>${d.content_link || ""}</td>
            <td>${d.transfer_date || ""}</td>
            <td>${d.status}</td>
            <td>${d.type_promote}</td>
            <td>${d.notes || ""}</td>
            <td>
              ${d.status === "ON_PROGRESS" ? `
                <button class="btn btn-sm btn-primary editDealBtn" data-id="${d.id}">
                  Edit
                </button>
              ` : ""}
              <button class="btn btn-sm btn-secondary printInvoiceBtn" data-id="${d.id}">
                Print
              </button>
              <button class="btn btn-sm btn-warning copyAlamat"
                      data-alamat="${d.admin?.alamat || ''}">
                  Alamat KOL
              </button>
            </td>
          </tr>
        `);

      });
    }

    $("#dealsTable").DataTable({
      responsive: true,
      pageLength: 10,
      dom: 'Bfrtip'
    });

  } catch (err) {
    console.error(err);
    alert("Terjadi kesalahan");
  }
}


// =========================
// FILTER
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
  $("#brandSelect").val(null).trigger("change");
  $("#kolSelect").val(null).trigger("change");

  $("input[name='typePromote'][value='PAID']").prop("checked", true);
  handleTypePromote();

  dealModal.show();
});

// =========================
// SAVE DEAL
// =========================
$("#dealForm").submit(async e => {
  e.preventDefault();

  const type = $("input[name='typePromote']:checked").val();

  if (type === "PAID" && !parseNumber($("#amountDealing").val())) {
    Swal.fire("Error", "Paid Promote wajib isi Amount Dealing", "error");
    return;
  }

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
    notes: $("#notes").val() || null,
    type_promote: type,
    deadline: $("#deadline").val() || null,
    amount_dealing: type === "PAID" ? parseNumber($("#amountDealing").val()) : null,
    admin_fee: parseNumber($("#adminFee").val()),
    admin_fee_2: parseNumber($("#adminFee2").val()),
    agency_fee: parseNumber($("#agencyFee").val()),
    kol_fee: type === "PAID" ? parseNumber($("#kolFee").val()) : null,
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
    Swal.fire("Error", error.message, "error");
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
  $("#notes").val(data.notes);

  $("input[name='typePromote'][value='" + data.type_promote + "']")
    .prop("checked", true);

  handleTypePromote();

  $("#deadline").val(data.deadline);
  $("#amountDealing").val(formatNumber(data.amount_dealing));
  $("#adminFee").val(formatNumber(data.admin_fee));
  $("#adminFee2").val(formatNumber(data.admin_fee_2));
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

// =========================
// Copy Alamat
// =========================
$(document).on("click", ".copyAlamat", function () {

    const alamat = $(this).data("alamat");

    if (!alamat) {
        Swal.fire({
            icon: "warning",
            title: "Alamat kosong",
            timer: 1500,
            showConfirmButton: false
        });
        return;
    }

    navigator.clipboard.writeText(alamat).then(() => {
        Swal.fire({
            icon: "success",
            title: "Alamat KOL berhasil disalin!",
            timer: 1000,
            showConfirmButton: false
        });
    }).catch(() => {
        Swal.fire({
            icon: "error",
            title: "Gagal menyalin alamat"
        });
    });

});
