# Pumpfun Stealth Bundler

### Launch tokens on Pump.fun with zero Bubblemap trace. Zero bundle detection. Maximum stealth.

The most advanced stealth bundler for Pump.fun — your token launch appears completely organic across every major analytics platform.

---

## Verified Clean On

> **Bubblemap** — No connection detected
> **Bundle Scanner** — Not flagged

- [Axiom.trade](https://axiom.trade) — Clean
- [Photon SOL](https://photon-sol.tinyastro.io) — Clean
- [DexScreener](https://dexscreener.com) — Clean
- [GMGN](https://gmgn.ai) — Clean

Your buyers show up as completely independent wallets — no cluster, no link, no flag.

---

## Test Results

Live on-chain proof:

- **Jito Bundle:** [explorer.jito.wtf/bundle/15e7d27...3656de](https://explorer.jito.wtf/bundle/15e7d2743ab4c584d0dff395536752a49329ee50d8ba2be855616c02563656de)
- **Solscan TX:** [solscan.io/tx/nphwuQe...ozQx2d](https://solscan.io/tx/nphwuQefa1TNQnobUvMrUH8N7NoEQDkULBZXphBk3M4eBma85Zqmn19M5WNaJuFu3feDiJ1mvamttH9twozQx2d)

---

## Features

- **Up to 16 Wallet Bundle** — Create your token and buy with up to 16 wallets in a single atomic bundle
- **Dual Bundle Engine** — Switch between **Jito** and **bloXroute** with one config change for best performance
- **Full Stealth** — Passes Bubblemap and all major bundle scanners cleanly
- **Atomic Execution** — Token creation + all buys land in the same block, guaranteed
- **Anti Front-Run** — Bundle transactions cannot be front-run or sandwiched
- **Custom Token Metadata** — Set name, symbol, description, image, and all social links
- **IPFS Upload** — Token image and metadata automatically uploaded to IPFS
- **Address Lookup Table** — Optimized transaction size using on-chain LUT
- **SOL Gather** — Collect all SOL back from buyer wallets in one command
- **LUT Cleanup** — Close lookup tables and reclaim rent when done
- **Token Status Check** — Monitor your token's bonding curve and migration status
- **Single Wallet Mode** — Lightweight mode for single-wallet bundle launch
- **Environment Config** — Everything controlled from a single `.env` file

---

## Bundle Modes

Easily switch between two leading bundle engines. Set `MODE=1` or `MODE=2` in your `.env`.

> **`MODE=1` — Jito**
> - Max **16** buyer wallets
> - 5 transactions per bundle
> - Direct Jito block engine submission

> **`MODE=2` — bloXroute**
> - Max **12** buyer wallets
> - 4 transactions per bundle (tip added automatically)
> - bloXroute Solana trader API submission

---

## Project Structure

```
16-Pumpfun-Bundler/
├── index.ts                 # Main entry — bundle launch
├── oneWalletBundle.ts       # Single wallet bundle mode
├── gather.ts                # Gather SOL from buyer wallets
├── closeLut.ts              # Close lookup table & reclaim rent
├── status.ts                # Check token status
├── constants/
│   └── constants.ts         # Environment config & constants
├── executor/
│   ├── jito.ts              # Jito bundle submission
│   ├── bloxroute.ts         # bloXroute bundle submission
│   ├── lil_jit.ts           # Lil Jit endpoint handler
│   └── legacy.ts            # Legacy executor
├── src/
│   ├── pumpfun.ts           # Pumpfun SDK — create & buy instructions
│   ├── main.ts              # SOL distribution & wallet management
│   ├── bondingCurveAccount.ts
│   ├── globalAccount.ts
│   ├── metadata.ts          # Token metadata builder
│   ├── uploadToIpfs.ts      # IPFS upload handler
│   ├── vanity.ts            # Vanity address generation
│   └── idl/                 # Pumpfun program IDL (latest)
├── utils/
│   ├── utils.ts             # Helper utilities
│   ├── logger.ts            # Logging
│   └── swapOnlyAmm.ts       # Raydium AMM swap util
├── keys/                    # Generated keypairs (auto)
├── image/                   # Token images
├── .env.example             # Environment template
└── package.json
```

---

## Quick Start

### 1. Install

```bash
yarn install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in your `.env` with your private key, RPC endpoint, token details, and preferred bundle mode.

### 3. Launch Bundle

```bash
yarn start
```

### Available Commands

> `yarn start` — Launch token + multi-wallet buy bundle
> `yarn single` — Single wallet bundle launch
> `yarn gather` — Gather SOL from all buyer wallets
> `yarn close` — Close lookup table & reclaim rent
> `yarn status` — Check token bonding curve status

---

## Requirements

- Node.js 18+
- Solana RPC endpoint (Helius recommended)
- Jito or bloXroute access depending on selected mode

---

## Contact

Have questions or need a custom solution?

- [Telegram](https://t.me/shiny0103)

---

## Disclaimer

This software is provided for educational and research purposes only. Use at your own risk and in compliance with all applicable laws and platform terms of service.
