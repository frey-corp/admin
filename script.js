// =========================
// SUPABASE CONFIG
// =========================
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://nqhggfqdjxawvxchbqdu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uFul_JGxo6iQJ8bVWb3YwQ_kmbWDvrI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// GLOBAL VARIABLES
// =========================
let currentUser = null;
let dealsTable = null;

// =========================
// UTILITY FUNCTIONS
// =========================
function formatRupiah(num) {
    return "Rp " + Number(num).toLocaleString("id-ID");
}

function calcFees(amount) {
    const adminFee = Math.round(amount * 0.15);
    const agencyFee = Math.round(amount * 0.05);
    const kolFee = amount - adminFee - agencyFee;
    return { adminFee, agencyFee, kolFee };
}

// =========================
// LOGIN
// =========================
$(document).ready(async function () {
    const loginModal = new bootstrap.Modal(document.getElementById('loginModal'), {
        backdrop: 'static',
        keyboard: false
    });
    loginModal.show();

    $('#loginBtn').click(async function () {
        const username = $('#username').val().trim();
        const password = $('#password').val().trim();

        if (!username || !password) {
            Swal.fire('Error', 'Username dan password harus diisi', 'error');
            return;
        }

        // Ambil user dari Supabase
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('role', 2) // hanya admin
            .limit(1);

        if (error || users.length === 0) {
            Swal.fire('Error', 'Username tidak ditemukan / bukan admin', 'error');
            return;
        }

        const user = users[0];

        // Untuk demo kita pakai dummy hash, di produksi pakai bcrypt verify
        if (password !== user.password_hash) {
            Swal.fire('Error', 'Password salah', 'error');
            return;
        }

        currentUser = user;
        loginModal.hide();
        $('#dashboard').removeClass('d-none');

        await loadFilters();
        await loadDeals();
    });
});

// =========================
// LOAD FILTERS (KOL & Brands)
// =========================
async function loadFilters() {
    // Load KOL yang dimapping ke admin ini
    const { data: kolMapping } = await supabase
        .from('admin_kol_mapping')
        .select('kol_user_id, kol_user:kol_user_id(full_name)')
        .eq('admin_user_id', currentUser.id);

    $('#filterKOL').empty().append('<option value="">ALL</option>');
    $('#kolSelect').empty();
    kolMapping.forEach(k => {
        $('#filterKOL').append(`<option value="${k.kol_user_id}">${k.kol_user.full_name}</option>`);
        $('#kolSelect').append(`<option value="${k.kol_user_id}">${k.kol_user.full_name}</option>`);
    });
    $('#filterKOL, #kolSelect').select2({ width: '100%' });

    // Load Brands
    const { data: brands } = await supabase.from('brands').select('*');
    $('#brandSelect').empty();
    brands.forEach(b => {
        $('#brandSelect').append(`<option value="${b.id}">${b.brand_name}</option>`);
    });

    // Set default date filter
    const today = new Date().toISOString().split('T')[0];
    const past3Month = new Date();
    past3Month.setMonth(past3Month.getMonth() - 3);
    const past3MonthStr = past3Month.toISOString().split('T')[0];

    $('#filterDateFrom').val(past3MonthStr);
    $('#filterDateTo').val(today);

    $('#dealDate').val(today);
}

// =========================
// LOAD DEALS TABLE
// =========================
async function loadDeals() {
    const dateFrom = $('#filterDateFrom').val();
    const dateTo = $('#filterDateTo').val();
    const kolId = $('#filterKOL').val();
    const status = $('#filterStatus').val();

    let query = supabase
        .from('deals')
        .select(`
            id,
            deal_date,
            job_description,
            deadline,
            amount_dealing,
            status,
            kol_user:kol_user_id(full_name),
            brand:brand_id(brand_name)
        `)
        .gte('deal_date', dateFrom)
        .lte('deal_date', dateTo);

    if (kolId) query = query.eq('kol_user_id', kolId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query.order('deal_date', { ascending: false });

    if (error) {
        Swal.fire('Error', 'Gagal load data deals', 'error');
        return;
    }

    // Destroy existing datatable
    if ($.fn.DataTable.isDataTable('#dealsTable')) {
        $('#dealsTable').DataTable().destroy();
    }
    $('#dealsTable tbody').empty();

    data.forEach(d => {
        $('#dealsTable tbody').append(`
            <tr>
                <td>${d.deal_date}</td>
                <td>${d.brand.brand_name}</td>
                <td>${d.kol_user.full_name}</td>
                <td>${d.job_description}</td>
                <td>${d.deadline || ''}</td>
                <td>${formatRupiah(d.amount_dealing)}</td>
                <td>${d.status}</td>
                <td>
                    <button class="btn btn-sm btn-primary editDealBtn" data-id="${d.id}">Edit</button>
                </td>
            </tr>
        `);
    });

    dealsTable = $('#dealsTable').DataTable({
        responsive: true
    });
}

// =========================
// FILTER CHANGE
// =========================
$('#filterDateFrom, #filterDateTo, #filterKOL, #filterStatus').change(loadDeals);

// =========================
// ADD DEAL MODAL
// =========================
const dealModal = new bootstrap.Modal(document.getElementById('dealModal'));

$('#addDealBtn').click(function () {
    $('#dealModalTitle').text('Add Deal');
    $('#dealForm')[0].reset();
    $('#kolSelect, #brandSelect, #statusSelect').val(null).trigger('change');
    $('#kolFee').val('');
    dealModal.show();
});

// =========================
// AUTO CALC FEES
// =========================
$('#amountDealing, #adminFee, #agencyFee').on('input', function () {
    const amount = parseFloat($('#amountDealing').val()) || 0;
    let admin = parseFloat($('#adminFee').val()) || Math.round(amount * 0.15);
    let agency = parseFloat($('#agencyFee').val()) || Math.round(amount * 0.05);
    const kol = amount - admin - agency;
    $('#adminFee').val(admin);
    $('#agencyFee').val(agency);
    $('#kolFee').val(kol);
});

// =========================
// SAVE DEAL
// =========================
$('#dealForm').submit(async function (e) {
    e.preventDefault();

    const dealData = {
        deal_date: $('#dealDate').val(),
        brand_id: parseInt($('#brandSelect').val()),
        kol_user_id: $('#kolSelect').val(),
        admin_user_id: currentUser.id,
        job_description: $('#jobDesc').val(),
        deadline: $('#deadline').val() || null,
        amount_dealing: parseFloat($('#amountDealing').val()),
        admin_fee: parseFloat($('#adminFee').val()),
        agency_fee: parseFloat($('#agencyFee').val()),
        kol_fee: parseFloat($('#kolFee').val()),
        brief_sow: $('#briefSow').val() || null,
        content_link: $('#contentLink').val() || null,
        transfer_date: $('#transferDate').val() || null,
        status: $('#statusSelect').val()
    };

    if (dealData.status === 'FINISH' && !dealData.transfer_date) {
        Swal.fire('Error', 'Transfer date harus diisi saat status Finish', 'error');
        return;
    }

    Swal.fire({
        title: 'Saving...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const { data, error } = await supabase
        .from('deals')
        .insert([dealData]);

    Swal.close();

    if (error) {
        Swal.fire('Error', 'Gagal menyimpan deal', 'error');
    } else {
        Swal.fire('Success', 'Deal berhasil disimpan', 'success');
        dealModal.hide();
        await loadDeals();
    }
});

// =========================
// EDIT DEAL BUTTON (Future)
// =========================
$(document).on('click', '.editDealBtn', function () {
    const id = $(this).data('id');
    Swal.fire('Info', `Edit deal ID: ${id} (feature nanti)`, 'info');
});
