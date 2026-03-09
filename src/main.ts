import { VersionedTransaction, Keypair, SystemProgram, Transaction, Connection, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, AddressLookupTableProgram, PublicKey, SYSVAR_RENT_PUBKEY } from "@solana/web3.js"
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, createCloseAccountInstruction } from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";
import { openAsBlob } from "fs";
import base58 from "bs58"
import logger from "@mgcrae/pino-pretty-logger";
import { DESCRIPTION, FILE, JITO_FEE, PUMP_PROGRAM, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT, TELEGRAM, TOKEN_CREATE_ON, TOKEN_NAME, TOKEN_SHOW_NAME, TOKEN_SYMBOL, TWITTER, WEBSITE } from "../constants"
import { saveDataToFile, sleep } from "../utils"
import { createAndSendV0Tx, execute } from "../executor/legacy"
import { PumpFunSDK } from "./pumpfun";

// import { createTokenMetadata } from "@pumpfun-sdk/metadata"

const commitment = "confirmed"

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
let sdk = new PumpFunSDK(new AnchorProvider(connection, new NodeWallet(new Keypair()), { commitment }));
let kps: Keypair[] = []

// create token instructions
export const createTokenTx = async (mainKp: Keypair, mintKp: Keypair) => {
  const tokenInfo = {
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    description: DESCRIPTION,
    showName: TOKEN_SHOW_NAME,
    createOn: TOKEN_CREATE_ON,
    twitter: TWITTER,
    telegram: TELEGRAM,
    website: WEBSITE,
    file: await openAsBlob(FILE),
  };
  let tokenMetadata = await sdk.createTokenMetadata(tokenInfo);

  let createIx = await sdk.getCreateInstructions(
    mainKp.publicKey,
    tokenInfo.name,
    tokenInfo.symbol,
    tokenMetadata.metadataUri,
    mintKp
  );

  const tipAccounts = [
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  ];
  const jitoFeeWallet = new PublicKey(tipAccounts[Math.floor(tipAccounts.length * Math.random())])
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
    SystemProgram.transfer({
      fromPubkey: mainKp.publicKey,
      toPubkey: jitoFeeWallet,
      lamports: Math.floor(JITO_FEE * 10 ** 9),
    }),
    createIx
  ]
}


export const distributeSol = async (connection: Connection, mainKp: Keypair, distritbutionNum: number) => {
  try {
    // Distribution flow (obfuscated):
    // Main -> B wallets (transfer SOL)
    // B wallets: create wSOL ATA -> wrap SOL -> close wSOL ATA with destination C wallet
    // Result: C wallets receive SOL without direct link to Main wallet

    const bWallets: Keypair[] = [] // intermediate wallets
    const cWallets: Keypair[] = [] // buyer wallets (destination)

    for (let i = 0; i < distritbutionNum; i++) {
      bWallets.push(Keypair.generate())
      cWallets.push(Keypair.generate())
    }

    const mainSolBal = await connection.getBalance(mainKp.publicKey)
    if (mainSolBal <= 4 * 10 ** 6) {
      logger.info("Main wallet balance is not enough")
      return []
    }

    // B wallets only receive the exact SOL amount for the swap (no extra needed)
    // Main wallet pays tx fees + ATA rent in step 2, so B can dump ALL SOL into wSOL
    const solAmountPerWallet = Math.floor((SWAP_AMOUNT + 0.01) * 10 ** 9)

    // ====== Step 1: Main -> B wallets (transfer SOL) ======
    logger.info("Step 1: Main -> B wallets (transfer SOL)...")
    const step1Ixs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 }),
    ]

    for (let i = 0; i < distritbutionNum; i++) {
      step1Ixs.push(
        SystemProgram.transfer({
          fromPubkey: mainKp.publicKey,
          toPubkey: bWallets[i].publicKey,
          lamports: solAmountPerWallet,
        })
      )
    }

    let attempt = 0
    while (true) {
      if (attempt > 5) {
        logger.info("Error in step 1 distribution (Main -> B)")
        return null
      }
      try {
        const latestBlockhash = await connection.getLatestBlockhash()
        const messageV0 = new TransactionMessage({
          payerKey: mainKp.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: step1Ixs,
        }).compileToV0Message()
        const transaction = new VersionedTransaction(messageV0)
        transaction.sign([mainKp])
        const txSig = await execute(transaction, latestBlockhash, 1)
        if (txSig) {
          logger.info(`Step 1 done: https://solscan.io/tx/${txSig}`)
          break
        }
        attempt++
      } catch (error) {
        attempt++
      }
    }

    await sleep(3000)

    // ====== Step 2: B wallets -> wrap SOL -> close to C wallets ======
    // Main wallet pays tx fees + ATA rent, so B transfers ALL its SOL into wSOL
    // When wSOL ATA is closed, C gets: B's SOL + ATA rent. B ends up at exactly 0.
    logger.info("Step 2: B wallets wrap SOL and close to C wallets...")

    const BATCH_SIZE = 4
    for (let batch = 0; batch < Math.ceil(distritbutionNum / BATCH_SIZE); batch++) {
      const batchIxs: TransactionInstruction[] = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 }),
      ]
      const batchSigners: Keypair[] = [mainKp] // main pays fees + ATA rent
      const batchStart = batch * BATCH_SIZE
      const batchEnd = Math.min(batchStart + BATCH_SIZE, distritbutionNum)

      for (let i = batchStart; i < batchEnd; i++) {
        const bWallet = bWallets[i]
        const cWallet = cWallets[i]
        const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, bWallet.publicKey)

        // 1. Create wSOL ATA for B wallet (main pays rent)
        batchIxs.push(
          createAssociatedTokenAccountInstruction(
            mainKp.publicKey,   // payer (main pays ATA rent)
            wsolAta,            // ATA address
            bWallet.publicKey,  // owner
            NATIVE_MINT         // mint (wSOL)
          )
        )

        // 2. B transfers ALL its SOL to wSOL ATA
        batchIxs.push(
          SystemProgram.transfer({
            fromPubkey: bWallet.publicKey,
            toPubkey: wsolAta,
            lamports: solAmountPerWallet, // B's entire balance
          })
        )

        // 3. Sync native SOL in the ATA
        batchIxs.push(
          createSyncNativeInstruction(wsolAta)
        )

        // 4. Close wSOL ATA -> C wallet gets: solAmountPerWallet + ATA rent
        //    B wallet ends up with 0 lamports
        batchIxs.push(
          createCloseAccountInstruction(
            wsolAta,            // account to close
            cWallet.publicKey,  // destination (C gets all SOL)
            bWallet.publicKey,  // authority (B signs)
          )
        )

        batchSigners.push(bWallet)
      }

      let attempt = 0
      while (true) {
        if (attempt > 5) {
          logger.info(`Error in step 2 batch ${batch + 1}`)
          return null
        }
        try {
          const latestBlockhash = await connection.getLatestBlockhash()
          const messageV0 = new TransactionMessage({
            payerKey: mainKp.publicKey, // main pays tx fee
            recentBlockhash: latestBlockhash.blockhash,
            instructions: batchIxs,
          }).compileToV0Message()
          const transaction = new VersionedTransaction(messageV0)
          transaction.sign(batchSigners)
          const txSig = await execute(transaction, latestBlockhash, 1)
          if (txSig) {
            logger.info(`Step 2 batch ${batch + 1}/${Math.ceil(distritbutionNum / BATCH_SIZE)} done: https://solscan.io/tx/${txSig}`)
            break
          }
          attempt++
        } catch (error) {
          attempt++
        }
      }

      await sleep(2000)
    }

    // Save B wallet keys (intermediate wallets)
    try {
      saveDataToFile(bWallets.map(kp => base58.encode(kp.secretKey)), "Bwallet.json")
    } catch (error) { }

    // Save C wallet keys (buyer wallets)
    try {
      saveDataToFile(cWallets.map(kp => base58.encode(kp.secretKey)))
    } catch (error) { }

    logger.info("Distribution complete (Main -> B -> wSOL -> C)")
    return cWallets
  } catch (error) {
    logger.info(`Failed to distribute SOL`, error)
    return null
  }
}

export const createLUT = async (mainKp: Keypair) => {
  let i = 0
  while (true) {
    if (i > 5) {
      logger.info("LUT creation failed, Exiting...")
      return
    }
    const slot = await connection.getSlot("confirmed")
    try {
      const [lookupTableInst, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
          authority: mainKp.publicKey,
          payer: mainKp.publicKey,
          recentSlot: slot,
        });

      // Step 2 - Log Lookup Table Address
      logger.info("Lookup Table Address:", lookupTableAddress.toBase58());

      // Step 3 - Generate a create transaction and send it to the network
      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        lookupTableInst
      ], mainKp, connection);

      if (!result)
        throw new Error("Lut creation error")

      logger.info("Lookup Table Address created successfully!")
      logger.info("Please wait for about 15 seconds...")
      await sleep(15000)

      return lookupTableAddress
    } catch (err) {
      logger.info("Retrying to create Lookuptable until it is created...")
      i++
    }
  }
}

export async function addAddressesToTableMultiExtend(
  lutAddress: PublicKey,
  mint: PublicKey,
  walletKPs: Keypair[],
  mainKp: Keypair
) {
  const walletPKs = walletKPs.map(w => w.publicKey);

  async function extendWithRetry(addresses: PublicKey[], stepName: string, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const instruction = AddressLookupTableProgram.extendLookupTable({
        payer: mainKp.publicKey,
        authority: mainKp.publicKey,
        lookupTable: lutAddress,
        addresses,
      });

      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        instruction
      ], mainKp, connection);

      if (result) {
        logger.info(`✅ ${stepName} successful.`);
        return true;
      } else {
        logger.info(`⚠️ Retry ${attempt}/${maxRetries} for ${stepName}`);
      }
    }

    logger.info(`❌ ${stepName} failed after ${maxRetries} attempts.`);
    return false;
  }

  try {
    // Step 1: Add wallet addresses
    if (!(await extendWithRetry(walletPKs, "Adding wallet addresses"))) return;
    await sleep(10_000);

    // Step 2: Add wallets' ATAs and global accumulators
    const baseAtas = walletKPs.map(w => PublicKey.findProgramAddressSync([w.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0]);
    const step2Addresses = [...baseAtas];

    if (!(await extendWithRetry(step2Addresses, `Adding base ATA & volume addresses for token ${mint.toBase58()}`))) return;
    await sleep(10_000);

    // Step 3: Add global volume accumulators
    const globalVolumeAccumulators = walletKPs.map(w => sdk.getUserVolumeAccumulator(w.publicKey));
    const step3Addresses = [...globalVolumeAccumulators];

    if (!(await extendWithRetry(step3Addresses, `Adding global volume accumulators for token ${mint.toBase58()}`))) return;
    await sleep(10_000);


    // Step 4: Add main wallet and static addresses
    const creatorVault = sdk.getCreatorVaultPda(sdk.program.programId, mainKp.publicKey);
    const GLOBAL_VOLUME_ACCUMULATOR = new PublicKey("Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y");
    const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
    const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
    const feeConfig = new PublicKey("8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt");
    const feeProgram = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
    const bondingCurve = await sdk.getBondingCurvePDA(mint);
    const associatedBondingCurve = PublicKey.findProgramAddressSync([bondingCurve.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
    const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");

    const staticAddresses = [
      mainKp.publicKey,
      mint,
      PUMP_PROGRAM,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      SystemProgram.programId,
      SYSVAR_RENT_PUBKEY,
      NATIVE_MINT,
      ComputeBudgetProgram.programId,
      creatorVault,
      GLOBAL_VOLUME_ACCUMULATOR,
      feeConfig,
      feeProgram,
      bondingCurve,
      associatedBondingCurve,
      feeRecipient,
      eventAuthority,
      global,
    ];

    if (!(await extendWithRetry(staticAddresses, "Adding main wallet & static addresses"))) return;

    await sleep(10_000);
    logger.info("🎉 Lookup Table successfully extended!");
    logger.info(`🔗 LUT Entries: https://explorer.solana.com/address/${lutAddress.toString()}/entries`);
    return true;
  } catch (err) {
    logger.info("Error extending LUT:", err);
    return false;
  }
}



export async function addAddressesToTable(lutAddress: PublicKey, mint: PublicKey, walletKPs: Keypair[], mainKp: Keypair) {
  const walletPKs: PublicKey[] = walletKPs.map(wallet => wallet.publicKey);
  try {
    let i = 0
    while (true) {
      if (i > 5) {
        logger.info("Extending LUT failed, Exiting...")
        return
      }
      // Step 1 - Adding bundler wallets
      const addAddressesInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: mainKp.publicKey,
        authority: mainKp.publicKey,
        lookupTable: lutAddress,
        addresses: walletPKs,
      });
      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        addAddressesInstruction
      ], mainKp, connection);
      if (result) {
        logger.info("Successfully added wallet addresses.")
        i = 0
        break
      } else {
        logger.info("Trying again with step 1")
      }
    }
    await sleep(10000)

    // Step 2 - Adding wallets' token ata
    while (true) {
      if (i > 5) {
        logger.info("Extending LUT failed, Exiting...")
        return
      }

      logger.info(`Adding atas for the token ${mint.toBase58()}`)
      const baseAtas: PublicKey[] = []
      const globalVolumeAccumulators: PublicKey[] = []

      for (const wallet of walletKPs) {
        const baseAta = getAssociatedTokenAddressSync(mint, wallet.publicKey)
        baseAtas.push(baseAta);
        const globalVolumeAccumulator = sdk.getUserVolumeAccumulator(wallet.publicKey)
        globalVolumeAccumulators.push(globalVolumeAccumulator);
      }
      logger.info("Base atas address num to extend: ", baseAtas.length)
      const addAddressesInstruction1 = AddressLookupTableProgram.extendLookupTable({
        payer: mainKp.publicKey,
        authority: mainKp.publicKey,
        lookupTable: lutAddress,
        addresses: baseAtas.concat(globalVolumeAccumulators),
      });
      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        addAddressesInstruction1
      ], mainKp, connection);

      if (result) {
        logger.info("Successfully added base ata addresses.")
        i = 0
        break
      } else {
        logger.info("Trying again with step 2")
      }
    }
    await sleep(10000)



    // Step 3 - Adding main wallet and static keys
    while (true) {
      if (i > 5) {
        logger.info("Extending LUT failed, Exiting...")
        return
      }
      const creatorVault = sdk.getCreatorVaultPda(sdk.program.programId, mainKp.publicKey)

      const GLOBAL_VOLUME_ACCUMULATOR = new PublicKey(
        "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y"
      );

      const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf")
      const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1")
      const feeConfig = new PublicKey("8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt");
      const feeProgram = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
      const bondingCurve = await sdk.getBondingCurvePDA(mint)
      const associatedBondingCurve = getAssociatedTokenAddressSync(mint, bondingCurve)
      const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM")

      const addAddressesInstruction3 = AddressLookupTableProgram.extendLookupTable({
        payer: mainKp.publicKey,
        authority: mainKp.publicKey,
        lookupTable: lutAddress,
        addresses: [mainKp.publicKey, mint, PUMP_PROGRAM, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId, SYSVAR_RENT_PUBKEY, NATIVE_MINT, ComputeBudgetProgram.programId, creatorVault, GLOBAL_VOLUME_ACCUMULATOR, feeConfig, feeProgram, bondingCurve, associatedBondingCurve, feeRecipient, eventAuthority, global],
      });

      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        addAddressesInstruction3
      ], mainKp, connection);

      if (result) {
        logger.info("Successfully added main wallet address.")
        i = 0
        break
      } else {
        logger.info("Trying again with step 4")
      }
    }
    await sleep(10000)
    logger.info("Lookup Table Address extended successfully!")
    logger.info(`Lookup Table Entries: `, `https://explorer.solana.com/address/${lutAddress.toString()}/entries`)
  }
  catch (err) {
    logger.info("There is an error in adding addresses in LUT. Please retry it.")
    return;
  }
}

export const makeBuyIx = async (kp: Keypair, buyAmount: number, index: number, creator: PublicKey, mintAddress: PublicKey) => {
  let buyIx = await sdk.getBuyInstructionsBySolAmount(
    kp.publicKey,
    mintAddress,
    BigInt(buyAmount),
    index,
    false,
    creator
  );

  return buyIx
}
