💡 PROMPT UNTUK CODEX

Tujuan:
Buat proyek TypeScript + Ponder untuk meng-index protokol lending multi-collateral & cross-chain (Arbitrum dan Base).
Gunakan npm, clean architecture, best practice, modular, dan tambahkan perhitungan TVL & TVL USD secara otomatis.

🗒️ Rencana Kerja Bertahap
- [x] Siapkan skeleton proyek `indexer` dengan npm, konfigurasi TypeScript, Ponder, dan struktur folder dasar. (Selesai: folder `indexer/lending-ponder` berisi package.json, tsconfig, schema awal, struktur `src/handlers` & `src/lib`, serta README/.gitignore)
- [x] Tambahkan `config.lending.json` untuk Arbitrum & Base, ambil RPC dari `.env`, isi alamat kontrak, dan set `startBlockOffset`. (Done: `config.lending.json` menyimpan address + `startBlock`, `ponder.config.ts` membaca struktur baru dan menarik RPC dari env var)
- [x] Definisikan entity di `schema.ts`, termasuk kolom `tvlUsd` pada `Market` dan `ProtocolStatsDaily`. (Selesai: `ponder.schema.ts` memuat seluruh entity + kolom TVL sesuai requirement)
- [x] Bangun utilitas di `src/lib` (`math.ts`, `hf.ts`, `price.ts`, `ids.ts`) agar handler bisa pakai BigInt precision RAY. (Selesai: fungsi presisi RAY dan helper ID tersedia di `src/lib/*`)
- [x] Implementasikan handler per kontrak di `src/handlers` yang idempotent, reorg-safe, dan memperbarui TVL, HF, serta statistik harian. (Selesai: handler lending/erc20/oapp mengelola state & agregasi di `src/handlers/*`)
- [x] Pasang integrasi oracle dan fallback harga 1 USD ketika data tidak tersedia, pastikan update TVL otomatis. (Selesai: `src/lib/price.ts` + `handlePriceUpdated` menjaga oracle dengan fallback 1 USD)
- [x] Tangani event cross-chain `MessageSent`/`MessageDelivered`, hubungkan via `(srcChainId, nonce, payloadHash)` dan simpan status + latency. (Selesai: `src/handlers/oapp.ts` membuat/memutakhirkan pesan lintas-chain)
- [x] Konfigurasi `ponder.config.ts` supaya load `config.lending.json`, registrasi ABI, network, dan start block per chain. (Selesai: `ponder.config.ts` generate chain/contract dari config + env)
- [ ] Uji jalur utama: `npm install`, salin `.env.example`, jalankan `npm run dev`, dan catat masalah untuk iterasi berikutnya. (Belum: perlu dieksekusi & dokumentasikan hasilnya)

Catatan: centang dan tulis ringkasan hasil di setiap poin sebelum lanjut ke langkah berikutnya supaya progres mudah dilacak.

🎯 Fitur Utama

Config-driven multi-chain

Baca dari config.lending.json berisi dua chain: Arbitrum dan Base, lengkap dengan alamat kontrak.

RPC URL diambil dari .env.

Kontrak yang diindex

ERC20 (USDC, WETH, WBTC)

LendingPool (Supply, Withdraw, Borrow, Repay, Accrue, Liquidate)

OAppBorrow (MessageSent, MessageDelivered)

Database auto-generate

Gunakan schema.ts GraphQL Ponder untuk mendefinisikan entity.

Tidak ada migrasi manual; Ponder buat DB otomatis.

Entity/Model yang harus ada

Chain, Token, Market, Position, PositionCollateral, PositionDebt, OraclePrice, Liquidation, CrossChainMessage, ProtocolStatsDaily

Tambahkan Market.tvlUsd dan ProtocolStatsDaily.tvlUsd

Event handler

Supply: tambah collateral user, update market supply & TVL.

Withdraw: kurangi collateral user.

Borrow: tambah debt user, update total borrow & TVL.

Repay: kurangi debt user.

Accrue: update indeks & akrual interest.

Liquidate: buat entri likuidasi.

MessageSent/Delivered: buat cross-chain status.

Semua handler idempotent (gunakan upsert), dan reorg-safe.

TVL computation

TVL = ∑(totalSupplyAsset_i × oraclePrice_i / 10^decimals_i)

Simpan per Market (tvlUsd) dan agregat harian (ProtocolStatsDaily.tvlUsd).

Gunakan precision RAY (1e27) untuk semua nilai USD.

Update TVL setiap event Supply/Withdraw/Borrow/Repay/Accrue.

Cross-chain support

Index pesan cross-chain (MessageSent / MessageDelivered)

Hubungkan keduanya via (srcChainId, nonce, payloadHash)

Simpan latency (opsional) dan status (sent, delivered)

Oracle integration

Simpan OraclePrice dari event PriceUpdated(asset, price).

Jika tidak ada event oracle, fallback harga 1 USD.

Gunakan harga terakhir untuk hitung TVL & HF.

Health Factor (HF)

HF = (Σ(collateralUSD × collateralFactorBps/10000)) ÷ max(Σ(debtUSD), ε)

Simpan sebagai Position.healthFactorRay (1e27 precision).

Daily aggregation

Derive hari via dayBucket(ts)

Update ProtocolStatsDaily setiap event pasar:

tvlUsd

totalBorrowsUsd

feesUsd

revenueUsd

🧱 Struktur Project
/lending-ponder
 ├─ abi/
 │   ├─ ERC20.json
 │   ├─ LendingPool.json
 │   └─ OAppBorrow.json
 ├─ src/
 │   ├─ handlers/
 │   │   ├─ erc20.ts
 │   │   ├─ lending.ts
 │   │   └─ oapp.ts
 │   └─ lib/
 │       ├─ ids.ts
 │       ├─ math.ts
 │       ├─ price.ts
 │       └─ hf.ts
 ├─ schema.ts
 ├─ ponder.config.ts
 ├─ config.lending.json
 ├─ .env.example
 ├─ package.json
 ├─ tsconfig.json
 └─ README.md

🧩 Rekomendasi Implementasi (yang Codex harus bangunkan)
package.json

gunakan npm, bukan pnpm

scripts:

"dev": "ponder dev", "start": "ponder start", "codegen": "ponder codegen", "typecheck": "tsc --noEmit"

config.lending.json

berisi Arbitrum & Base (alamat yang kamu berikan)

startBlockOffset: 200000

schema.ts

tambahkan kolom tvlUsd di Market dan ProtocolStatsDaily

handlers/lending.ts

setiap event update:

Market totalSupplyAssets / totalBorrowAssets

Recompute tvlUsd = totalSupplyAssets * price / 10^decimals

Update ProtocolStatsDaily.tvlUsd

lib/math.ts

fungsi toUsd(amount, price, decimals)

fungsi toRay, mulRay, divRay, dayBucket

lib/hf.ts

hitung ulang Health Factor dari posisi setiap kali event supply/borrow berubah

ponder.config.ts

load config JSON → generate networks + contracts

startBlock optional

attach ABI (path di abi/*)

🧮 Output yang Diharapkan

Market berisi tvlUsd real-time dari event terakhir.

ProtocolStatsDaily menampilkan akumulasi harian TVL, Borrow, Fees, Revenue.

Query GraphQL bisa:

{
  markets {
    id
    tvlUsd
    totalSupplyAssets
    totalBorrowAssets
  }
}

✅ Acceptance Criteria

npm install && cp .env.example .env → isi RPC

Jalankan npm run dev → indexer langsung bekerja

Tidak perlu create table manual

TVL dalam USD otomatis terupdate

Handler bersih, modular, dan idiomatik TypeScript

Menambah chain baru cukup ubah config.lending.json

Ganti ABI asli tanpa refactor besar

Gunakan gaya clean code:

Fungsi pure,

Handler < 100 baris,

Utilities reusable,

Comment pendek dan jelas,

Gunakan BigInt consistently,

Error log minimal tapi informatif.

Output akhir: Proyek Ponder siap jalan dengan npm, sudah menghitung TVL (USD) real-time, multi-chain Arbitrum & Base, modular dan clean.
