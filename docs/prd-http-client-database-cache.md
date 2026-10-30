# PRD: Penyimpanan Database dan Cache Local-First untuk HTTP Client

| | |
|---|---|
| Status | Draft revisi 2, untuk ditinjau |
| Tanggal | 2026-10-30 |
| Modul | HTTP Client (`lib/http-client`, `components/http-client`, `app/http-client`) |
| Audiens | Tim engineering |

## 1. Ringkasan

HTTP Client menyimpan collection, environment, state, dan history sebagai file JSON di `.http-client/`, dan memuat ulang semuanya lewat RPC setiap halaman dibuka.
Alat ini akan dipakai untuk bekerja bersama dalam tim. Dokumen ini mendefinisikan:

1. Penyimpanan bersama di PostgreSQL (Neon, paket gratis) di balik antarmuka store yang bisa diganti, dengan workspace tim.
2. Pendekatan local-first: IndexedDB di browser menjadi sumber data utama untuk UI, dan perubahan disinkronkan ke server secara tertunda.
3. TanStack Query sebagai lapisan baca di UI, dan SSR hanya untuk kerangka halaman.

Eksekusi request (`send`), WebSocket, OAuth, dan console tidak di-cache dan tidak berubah.

## 2. Kondisi saat ini (dari kode)

- Seluruh akses data lewat satu kelas, `HttpClientStore` di `lib/http-client/core/store/store.ts`.
  `HttpClientService` membuatnya sendiri di konstruktor (`new HttpClientStore(storage)`).
- `HttpClientStoragePort` hanya mengembalikan path folder, sehingga tidak bisa dipakai untuk database.
- `lib/http-client/server/runtime.ts` membuat satu runtime per proses, disimpan di `globalThis`.
- `lib/http-client/ui/rpc.ts` memanggil server dengan `fetch` biasa. Belum ada lapisan cache.
- `app/http-client/page.tsx` bersifat `force-dynamic` dan dijaga `httpClientServerEnabled()`.
- `package.json`: Next.js `^16.4.3`, React `^19.3.1`, Zustand. TanStack Query belum terpasang.

Masalah yang diselesaikan:

- Data terkunci di satu mesin dan tidak bisa dibagi dengan anggota tim.
- Penulisan bersamaan saling menimpa (collection ditulis ulang utuh).
- Tiap muat halaman menampilkan keadaan loading sebelum pohon collection tampil.

## 3. Tujuan dan bukan tujuan

**Tujuan**

- G1. Collection, environment, dan state bersama tersimpan di PostgreSQL dan dipakai satu workspace tim.
- G2. UI membaca dan menulis ke IndexedDB, sehingga terbuka dan berubah instan tanpa menunggu server.
- G3. Perubahan tersimpan lokal segera dan disinkronkan ke server secara tertunda (bawaan lima menit, bisa diatur).
- G4. Nilai secret ikut tersimpan dan ikut disinkronkan, tanpa pembatasan tampilan atau akses bagi anggota workspace.
- G5. Perilaku semua fitur yang ada tidak berubah. Mode file tetap tersedia lewat env var.

**Bukan tujuan**

- Cache hasil eksekusi request atau status WebSocket.
- Penyuntingan kolaboratif real-time (kursor, penggabungan per karakter).
- Mengganti core Silak yang sudah di-port.

## 4. Keputusan framework (K1)

TanStack Query adalah pustaka cache. TanStack Start adalah framework pengganti Next.js. Keduanya terpisah,
dan cache local-first tidak mewajibkan pindah framework.

| | Opsi A: tetap Next.js 16 + TanStack Query | Opsi B: pindah ke TanStack Start |
|---|---|---|
| Perubahan | Tambah pustaka dan provider | Migrasi seluruh aplikasi |
| SSR | Hanya kerangka halaman, data dari IndexedDB | Sama; paket `@tanstack/react-router-ssr-query` tersedia bila kelak butuh prefetch |
| Core Node (`node:vm`, `ws`, SSE, `AsyncLocalStorage`, singleton `globalThis`) | Sudah berjalan | **Belum diverifikasi** di Start |
| Status rilis stabil | Tidak relevan | **Belum diverifikasi** |
| Risiko | Rendah | Tinggi untuk fitur yang sudah selesai |

**Rekomendasi: Opsi A.** Lapisan data ditulis tanpa bergantung pada Next.js sehingga bisa dipindah ke Start nanti.
Bila Opsi B dipilih, tambahkan Fase 0 (spike) untuk membuktikan SSE, WebSocket, dan eksekusi script di Start.

## 5. Pembagian data

| Data | Sumber utama | Sinkron ke Postgres |
|---|---|---|
| Collection dan request | IndexedDB | Ya, tertunda, dengan versi dan penanganan konflik |
| Environment, termasuk nilai secret | IndexedDB | Ya, tertunda, nilai secret ikut |
| Variabel global | IndexedDB | Ya |
| Environment aktif | IndexedDB (preferensi per pengguna) | Tidak |
| Respons dan history | IndexedDB, dengan batas ukuran dan buang yang terlama | Tidak secara bawaan (lihat OQ4) |
| Console | Memori | Tidak |

## 6. Kebutuhan fungsional

**Server dan penyimpanan**

- FR-1. Ekstrak `interface HttpClientStore` dari kelas yang ada. Kelas lama menjadi `FileStore`. Tambah `DbStore`.
  `HttpClientService` menerima store lewat deps. Pilihan store dibaca di `runtime.ts` dari `HTTP_CLIENT_STORE=file|db` (bawaan: `file`).
- FR-2. Skema PostgreSQL (Drizzle, pg-core), model dokumen:
  | Tabel | Isi | Kunci |
  |---|---|---|
  | `http_collections` | `data jsonb` berisi `Collection` utuh, plus `name`, `version`, `updated_at`, `updated_by` | (`workspace_id`, `id`) |
  | `http_environments` | `data jsonb` berisi `Environment`, plus `name`, `version`, `updated_at`, `updated_by` | (`workspace_id`, `id`) |
  | `http_state` | `globals jsonb` | `workspace_id` |
  ID bertipe `text` karena hasil impor bisa memakai ID non-UUID. Tabel keanggotaan workspace mengikuti keputusan auth (OQ2).
- FR-3. Optimistic lock: simpan dengan `UPDATE ... WHERE version = ?`. Bila tidak ada baris berubah, server mengembalikan konflik.
  Ini menambah parameter versi pada `saveCollection` dan `saveEnvironment`.
- FR-4. Nilai secret disimpan apa adanya di `data jsonb`, tanpa enkripsi. Tidak ada kunci enkripsi yang perlu dikelola.
- FR-5. `ensureSeed` memakai `INSERT ... ON CONFLICT DO NOTHING`.
- FR-6. Skrip migrasi sekali jalan dari `.http-client/collections/*.json` dan `environments/*.json` ke `DbStore`, idempoten.

**Klien local-first**

- FR-7. Toko lokal di IndexedDB untuk collection, environment, global, history, dan antrean perubahan (outbox). UI membaca lewat TanStack Query dengan `queryFn` yang membaca toko lokal.
- FR-8. Setiap perubahan ditulis ke IndexedDB segera (jeda singkat, usulan 1 detik) dan ditandai belum tersinkron.
- FR-9. Sinkronisasi ke server memakai throttle dengan batas tunggu maksimum, bawaan lima menit sejak perubahan pertama yang belum tersinkron.
  Debounce murni tidak dipakai karena pengguna yang terus mengetik tidak akan pernah memicu sinkronisasi.
  Perubahan juga dikirim saat tab disembunyikan atau ditutup (`visibilitychange`, `fetch` dengan `keepalive`), saat jendela kehilangan fokus, dan lewat tombol "Sinkronkan sekarang".
- FR-10. Hanya satu tab yang menjalankan sinkronisasi (pemimpin dipilih lewat Web Locks atau BroadcastChannel). Tab lain menerima pembaruan lewat BroadcastChannel.
- FR-11. Penarikan dari server saat aplikasi dibuka dan saat jendela kembali fokus. Perubahan dari anggota lain digabung ke toko lokal.
- FR-12. Konflik (versi server lebih baru dari versi dasar lokal): tampilkan dialog "pakai milik saya", "pakai milik server", atau "gandakan keduanya".
- FR-13. Minta `navigator.storage.persist()` agar data lokal tidak mudah dihapus browser, dan tampilkan status sinkronisasi (tersinkron, tertunda, gagal).
- FR-14. SSR hanya untuk kerangka halaman. HTML tidak berisi data pengguna, sehingga bisa di-cache di CDN. Pemeriksaan `httpClientServerEnabled()` tetap dijalankan lebih dulu.
- FR-15. Yang tidak di-cache: `send`, `cancel`, `ws*`, `oauthStart/oauthFinish`, dan console.

## 7. Arsitektur cache

| Lapisan | Isi | Masa segar (usulan) | Pembaruan |
|---|---|---|---|
| Kerangka halaman (SSR / CDN) | HTML tanpa data pengguna | Dapat di-cache | Saat deploy |
| IndexedDB | Semua data di bagian 5 | Tidak kedaluwarsa | Tulis lokal segera; tarik dari server saat buka dan saat fokus |
| TanStack Query (memori) | Hasil baca dari IndexedDB | `staleTime` pendek, dibatalkan saat tulis lokal | Mutasi lokal, pesan BroadcastChannel |
| Server (memori `DbStore`) | collection, environment | TTL 60 detik, opsional (Fase 5) | Write-through |

Angka di atas adalah usulan awal dan perlu disetel setelah diukur.

## 8. Kebutuhan non-fungsional

**Kinerja** (target, belum diukur)

- Membuka collection dan menyimpan perubahan tidak menunggu jaringan.
- Neon gratis menidurkan compute setelah 5 menit tanpa aktivitas. Query pertama setelah idle lebih lambat (lama belum diukur), tetapi tidak menghalangi UI karena UI membaca IndexedDB.
- Paket gratis Neon menangguhkan compute bila 100 CU-hour per project habis. Aplikasi tetap bisa dipakai secara lokal, sinkronisasi tertunda sampai server kembali.

**Keamanan dan akses**

- Akses ke server hanya untuk anggota tim yang terautentikasi (OQ2).
- `DATABASE_URL` hanya dibaca di server, tanpa prefiks `NEXT_PUBLIC_`.
- Data di database dan di IndexedDB tidak dienkripsi, termasuk nilai secret. Sediakan aksi hapus data lokal saat logout, karena perangkat bisa dipakai bersama.
- Server menjalankan script request lewat `node:vm` dan bisa mengakses URL mana pun. `node:vm` bukan sandbox keamanan, dan server bisa menjangkau jaringan internal tempat ia di-deploy.
  Untuk pemakaian oleh tim tepercaya ini bisa diterima. Bila akses diperluas ke luar tim, runner perlu dikaji ulang (OQ5).

**Kepatuhan dan data**

- Region database mengikuti ketentuan region yang disetujui (`aws-ap-southeast-1`). Ketersediaannya di paket gratis Neon belum saya verifikasi (OQ3).
- Paket gratis Neon hanya memberi satu snapshot manual dan riwayat 6 jam. Backup berkala memakai operasi ekspor yang sudah ada (`exportNative`).

## 9. Fase dan kriteria penerimaan

| Fase | Isi | Kriteria penerimaan |
|---|---|---|
| 0 (hanya bila K1 = B) | Spike TanStack Start | SSE, WebSocket, eksekusi script, dan singleton runtime berjalan di Start |
| 1 | FR-1 sampai FR-6 | Semua ops yang ada lulus terhadap `FileStore` dan `DbStore`; migrasi lalu ekspor menghasilkan data identik; dua simpan bersamaan menghasilkan satu konflik, bukan timpa diam-diam |
| 2 | FR-7, FR-8 | UI membaca dan menulis lewat IndexedDB; tutup dan buka browser mempertahankan perubahan tanpa server |
| 3 | FR-9 sampai FR-13 | Perubahan sampai ke server dalam batas waktu; tab ditutup tidak menghilangkan perubahan; dua tab tidak mengirim ganda; konflik memunculkan dialog |
| 4 | FR-14 | HTML halaman tidak berisi data pengguna dan bisa di-cache |
| 5 (opsional) | Cache server, sinkron history | Sesuai keputusan OQ4 |

Setiap fase diverifikasi dengan `tsc --noEmit`, `eslint`, `next build`, dan skrip terhadap `/api/http-client`.

## 10. Risiko

Penilaian di bawah adalah perkiraan awal penulis dan perlu ditinjau bersama pemilik risiko.

| Risiko | Inheren | Mitigasi | Residual |
|---|---|---|---|
| Dua anggota mengubah collection yang sama; jeda lima menit memperbesar peluang konflik | Tinggi | FR-3, FR-12, tombol sinkron manual, sinkron saat fokus hilang | Sedang |
| Perubahan hilang karena browser menghapus IndexedDB atau tab ditutup sebelum sinkron | Sedang | FR-8, FR-9 (kirim saat tab disembunyikan), FR-13 | Rendah |
| Secret tersimpan polos di database dan di IndexedDB perangkat bersama | Tinggi | Akses server hanya untuk anggota terautentikasi; hapus data lokal saat logout | Tinggi (diterima, sesuai keputusan produk) |
| Konflik terlalu sering pada collection besar | Sedang | Bila terbukti, pecah request menjadi baris tersendiri | Sedang |
| Query pertama lambat setelah Neon tidur | Sedang | UI membaca IndexedDB | Rendah |
| Kehilangan data di server (backup paket gratis terbatas) | Sedang | Ekspor berkala dan salinan di IndexedDB | Sedang |
| Migrasi ke TanStack Start merusak fitur yang selesai | Tinggi | Opsi A sebagai bawaan; Fase 0 bila Opsi B | Sedang (hanya bila Opsi B) |

## 11. Pertanyaan terbuka

- OQ1. Framework: Opsi A atau B (bagian 4)? Rekomendasi: A.
- OQ2. Mekanisme login dan keanggotaan workspace tim (penyedia auth, peran)? Belum ada auth di codebase.
- OQ3. Apakah region `aws-ap-southeast-1` tersedia di paket gratis Neon, dan apakah data ini wajib berada di region itu?
- OQ4. Apakah history dan respons perlu dibagi ke anggota tim? Bawaan di dokumen ini: hanya lokal.
- OQ5. Di mana aplikasi di-deploy (jaringan internal atau internet)? Ini menentukan seberapa jauh runner server perlu diisolasi.
- OQ6. Apakah lima menit cukup untuk kerja bersama? Bila anggota sering mengubah collection yang sama, interval bawaan perlu dipendekkan.
