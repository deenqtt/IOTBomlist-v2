# Help Page — Improvement Ideas

## 1. Deep Linking via URL Hash / Search Params

**Ide:** `/help?section=pcb` atau `/help#items` — tab aktif dibaca dari URL, bukan hanya `useState`.

**Penilaian: ✅ Worth doing, effort rendah**

- Implementasi ringan: ganti `useState` → `useSearchParams` dari `next/navigation`
- Impact tinggi: admin bisa share link langsung ke section tertentu ke tim
- `router.replace` saat klik tab → URL update tanpa full reload
- Backward compatible — kalau tidak ada param, default ke `overview`

---

## 2. Mobile Responsiveness

**Ide:** Sidebar TOC `w-52 shrink-0` terlalu lebar di layar kecil. Ganti dengan dropdown/sheet di mobile.

**Penilaian: ✅ Worth doing, effort sedang**

- `hidden md:flex` untuk sidebar di mobile
- Di bawah `md`: ganti dengan `<Select>` (shadcn) di atas konten sebagai section picker
- Help page kemungkinan diakses dari laptop/desktop production floor, tapi tetap penting
- Shadcn `Select` sudah ada di project — tidak perlu install dependency baru

---

## 3. Internal Search (Client-Side)

**Ide:** Search box di atas TOC untuk filter section atau highlight konten relevan.

**Penilaian: ⚠️ Nice to have, tapi defer dulu**

- Konten sekarang masih hardcoded JSX — search teks sulit tanpa refactor ke data structure
- Kalau nanti migrasi ke MDX (poin 4), search jadi jauh lebih mudah
- Saat ini cukup dengan deep linking — user bisa CTRL+F di browser
- Revisit setelah semua section selesai ditulis dan volume konten lebih besar

---

## 4. Migrasi ke MDX

**Ide:** Pindah konten dari `.tsx` ke file `.mdx` agar non-developer bisa edit tanpa sentuh TypeScript.

**Penilaian: ⏳ Good idea, tapi timing belum tepat**

- Saat ini konten masih ditulis aktif dan butuh banyak perubahan — terlalu dini untuk migrate
- MDX butuh setup Next.js plugin (`@next/mdx`) + layout wrapper
- Benefit utama muncul kalau ada Tech Writer atau PM yang akan edit dokumentasi sendiri
- **Rekomendasi:** Selesaikan semua section dulu, konten stabil → baru migrate ke MDX

---

## 5. Interaktivitas Ekstra

### 5a. Screenshot / GIF untuk proses multi-step

**Penilaian: ✅ Sudah disiapkan — image placeholder sudah ada**

- `ImagePlaceholder` component sudah dibuat, 6 placeholder sudah terpasang di section Items
- Tinggal user replace dengan SS asli atau GIF
- Untuk GIF: gunakan `<img>` biasa, bukan Next.js `<Image>` (animated GIF tidak didukung Next Image optimizer)

### 5b. Copy to Clipboard untuk code blocks / format data

**Penilaian: ✅ Worth doing untuk section Data Import**

- Berguna banget untuk contoh format CSV/Excel yang diexpect saat import BOM
- Implementasi: buat `<CodeBlock>` component dengan copy button (Clipboard icon dari lucide)
- shadcn tidak punya ini built-in, tapi implementasi manual ~15 baris

---

## Priority Order

| # | Item | Priority | Effort |
|---|------|----------|--------|
| 1 | Deep Linking (URL params) | 🔴 High | Low |
| 2 | Mobile Responsiveness | 🟠 Medium | Medium |
| 5a | Screenshot/GIF (sudah ada placeholder) | 🟠 Medium | Low (user action) |
| 5b | Copy to Clipboard code blocks | 🟡 Low-Medium | Low |
| 3 | Internal Search | 🟢 Low | High |
| 4 | MDX Migration | 🟢 Low | High |

**Rekomendasi urutan implement:**
1. Deep Linking — 1 session, impact langsung
2. Mobile Responsiveness — 1 session
3. Copy to Clipboard + CodeBlock component — pas sambil nulis section Data Import
4. MDX migration — nanti setelah semua section selesai
