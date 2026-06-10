# Rencana Peningkatan Halaman Help / User Manual

**File Target:** `frontend/src/app/(dashboard)/help/page.tsx`

Dokumen ini merangkum area peningkatan (*areas for improvement*) untuk halaman panduan pengguna agar mencapai standar aplikasi *Enterprise*.

## 1. Dukungan Deep Linking (URL Routing)
*   **Masalah**: Saat ini state tab yang aktif disimpan menggunakan `useState("overview")`. Jika halaman di-refresh, pengguna selalu kembali ke halaman pertama. Ini menyulitkan jika admin ingin membagikan tautan (*link*) ke bagian spesifik (misal: panduan Import BOM).
*   **Solusi**:
    *   Gunakan URL Search Params (`?section=pcb`) atau URL Hash (`#pcb`).
    *   Implementasikan `useSearchParams` (dari `next/navigation`) untuk membaca parameter saat halaman dimuat.
    *   Gunakan `router.push` atau `router.replace` untuk memperbarui URL setiap kali tab diklik.

## 2. Responsivitas Mobile (Mobile UX)
*   **Masalah**: Sidebar TOC (*Table of Contents*) memiliki lebar statis (`w-52 shrink-0`). Pada layar *mobile* atau *tablet* kecil, sidebar ini dapat merusak tata letak (*layout*) atau membuat area baca menjadi terlalu sempit.
*   **Solusi**:
    *   Sembunyikan sidebar di layar kecil menggunakan utility classes Tailwind (`hidden md:flex`).
    *   Gantikan navigasi sidebar dengan komponen `Select` (Dropdown) atau `Drawer`/`Sheet` di bagian atas halaman khusus untuk ukuran layar kecil.

## 3. Integrasi Pencarian Internal (Local Search)
*   **Ide**: Memudahkan pengguna untuk mencari topik tertentu tanpa harus menebak di tab mana informasi tersebut berada.
*   **Solusi**:
    *   Tambahkan kolom `Input` pencarian di atas Sidebar TOC.
    *   Buat logika pencarian *client-side* sederhana yang memfilter judul tab, atau melakukan penyorotan (*highlight*) pada teks jika kata kunci ditemukan dalam `SECTION_CONTENT`.

## 4. Transisi ke Format MDX (Pertimbangan Jangka Panjang)
*   **Masalah**: Seiring bertambahnya fitur aplikasi, teks dokumentasi yang diletakkan langsung (*hardcoded*) di dalam file `.tsx` akan membuat ukuran file membengkak dan sulit dirawat oleh anggota tim non-teknis.
*   **Solusi**:
    *   Pertimbangkan untuk memigrasikan konten statis ke format **MDX** (Markdown with JSX).
    *   Dengan MDX, teks ditulis dalam format Markdown standar yang bersih, namun tetap dapat menggunakan komponen React kustom (seperti `<Note>` atau `<StepList>`).

## 5. Peningkatan Interaktivitas Visual
*   **Ide**: Membantu pengguna memvisualisasikan alur kerja yang kompleks (contoh: *Mapping Column* saat import BOM).
*   **Solusi**:
    *   Sisipkan tangkapan layar (*screenshot*) atau GIF kecil yang mendemonstrasikan antarmuka UI di bagian langkah-langkah yang mungkin membingungkan.
    *   Tambahkan fitur **Copy to Clipboard** pada blok format data (misal: contoh header CSV yang valid untuk import) agar pengguna bisa menyalinnya dengan sekali klik.
