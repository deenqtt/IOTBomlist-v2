# Road Map Pengembangan & Optimalisasi IOTBomlist-v2

Dokumen ini merangkum hasil diskusi mengenai penyederhanaan fitur yang redundan dan rencana penambahan fitur strategis untuk meningkatkan nilai guna aplikasi bagi manajemen dan tim operasional.

---

## 1. Penyederhanaan (Simplification)

### A. Alur "Quick Project"
**Masalah:** Saat ini hierarki bersifat kaku: `Project` → `Product` → `PCB`. Jika ada pesanan sederhana, user merasa terlalu panjang karena harus membungkus PCB ke dalam Product sebelum bisa masuk ke Project.
**Solusi:**
- Memungkinkan penambahan **PCB secara langsung** ke dalam Project tanpa harus melalui entitas Product.
- Mengurangi jumlah klik dan waktu konfigurasi untuk proyek skala kecil.

---

## 2. Fitur Strategis Baru (High-Value Features)

### A. Dashboard Project Costing & Quoting
**Tujuan:** Memberikan gambaran finansial proyek secara instan bagi manajemen.
**Detail:**
- Agregasi otomatis biaya dari seluruh Product dan PCB di dalam satu Project.
- Fitur "Profit Margin Calculator": Memasukkan target margin untuk menghasilkan angka penawaran (quotation) ke customer.
- Statistik biaya: Komponen mana yang paling menguras anggaran dalam proyek tersebut.

### B. Sinkronisasi Stok Gudang (Internal vs Market)
**Tujuan:** Menghindari kepanikan "Stok Merah" jika barang sebenarnya masih tersedia di gudang sendiri.
**Detail:**
- Menambahkan kolom `Internal Stock` pada setiap baris BOM.
- **Logika Warna Baru:** Jika stok pasar habis (Merah) tetapi stok gudang mencukupi, baris akan berubah warna (misal: Hijau/Biru) untuk menandakan barang aman.
- Fitur "Reserved Stock": Mengunci jumlah barang di gudang untuk proyek tertentu agar tidak dipakai oleh proyek lain.

### C. Manajemen Revisi & Perbandingan BOM (Versioning)
**Tujuan:** Melacak perubahan desain dari waktu ke waktu.
**Detail:**
- Tombol **"Compare Version"**: Membandingkan dua revisi PCB atau Product secara berdampingan.
- Highlight otomatis: Menandai komponen yang ditambah, dihapus, atau diubah kuantitasnya di antara dua versi.

### D. Laporan Kelangkaan Terpadu (Shortage Center)
**Tujuan:** Alat bantu utama bagi tim Purchasing untuk bekerja lebih cepat.
**Detail:**
- Satu halaman khusus yang menampilkan **hanya barang-barang yang statusnya MERAH** (habis stok) dari seluruh Project yang sedang aktif.
- Grouping berdasarkan Supplier (misal: "Daftar barang yang harus dicarikan alternatif di Mouser").
- Tombol aksi cepat untuk mencari alternatif langsung dari halaman laporan kelangkaan.

---

## 3. Prioritas Implementasi (Rekomendasi)
1. **Shortage Center & Project Costing**: Paling mendesak untuk kebutuhan manajemen dan purchasing.
2. **Internal Stock**: Penting jika perusahaan sudah memiliki sistem inventaris sendiri.
3. **BOM Versioning**: Sangat berguna untuk tim Engineer jangka panjang.

---
*IOTBomlist-v2 - Smart Manufacturing Decision Support System*
