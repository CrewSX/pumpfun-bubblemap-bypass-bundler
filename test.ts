import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { ComputeBudgetProgram } from '@solana/web3.js';
import { solanaConnection } from './gather';
import base58 from "bs58"
import { PRIVATE_KEY } from './constants';
import { sendBundle, simulateBundle } from './executor/lil_jit';

const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
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
const receiverWallet = new PublicKey('CTeEtoFVnTjwJoDcYvJwKNEvDnQfBn3ncgBUZ1e9ybXa');
const JITO_FEE = 0.001; // example SOL

// --- Create instructions for one transaction ---
const instructions = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000_000 }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
  SystemProgram.transfer({
    fromPubkey: mainKp.publicKey,
    toPubkey: jitoFeeWallet,
    lamports: Math.floor(JITO_FEE * 10 ** 9),
  }),
];

// --- Another SOL transfer instruction ---
const solTransferInstructions = [
  SystemProgram.transfer({
    fromPubkey: mainKp.publicKey,
    toPubkey: receiverWallet,
    lamports: 1_000_000, // 1 SOL example
  }),
];

// --- Helper to create a versioned transaction ---
async function createVersionedTx(instructionsArr: TransactionInstruction[]) {
  const messageV0 = new TransactionMessage({
    payerKey: mainKp.publicKey,
    recentBlockhash: (await solanaConnection.getLatestBlockhash()).blockhash,
    instructions: instructionsArr,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

(async() => {

    const versionedTx1 = await createVersionedTx(instructions);
    console.log("1 simulate ==>", await solanaConnection.simulateTransaction(versionedTx1))
    const versionedTx2 = await createVersionedTx(solTransferInstructions);
    console.log("2 simulate ==>", await solanaConnection.simulateTransaction(versionedTx2))
    
    // --- Store them in an array ---
    const versionedTxArray: VersionedTransaction[] = [versionedTx1];
    
    await simulateBundle(versionedTxArray)
    const result  = await sendBundle(versionedTxArray)
    console.log("🚀 ~ result:", result)
})()
