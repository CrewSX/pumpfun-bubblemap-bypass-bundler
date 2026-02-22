import axios, { AxiosResponse } from "axios";
import { Connection, Keypair, VersionedTransaction, TransactionMessage, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, BLOXROUTE_AUTH_TOKEN, BLOXROUTE_SUBMIT_BATCH_URL, BLOXROUTE_TIP_ACCOUNTS, BLOXROUTE_TIP_AMOUNT_SOL } from "../constants";

const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

/**
 * Get a random BloxRoute tip account
 */
const getTipAccount = (): string => {
  const randomIndex = Math.floor(Math.random() * BLOXROUTE_TIP_ACCOUNTS.length);
  const tipAccount = BLOXROUTE_TIP_ACCOUNTS[randomIndex];
  if (!tipAccount) {
    throw new Error("BloxRoute: no tip accounts available");
  }
  return tipAccount;
};

/**
 * Create a tip transaction for BloxRoute
 */
const createTipTransaction = async (payer: Keypair): Promise<VersionedTransaction> => {
  const tipAccount = getTipAccount();
  const tipInstruction = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey(tipAccount),
    lamports: Math.floor(BLOXROUTE_TIP_AMOUNT_SOL * LAMPORTS_PER_SOL),
  });

  const { blockhash } = await solanaConnection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [tipInstruction],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);
  transaction.sign([payer]);

  return transaction;
};

/**
 * Send bundle via BloxRoute submit-batch API
 */
export const sendBundleBloxRoute = async (
  transactions: VersionedTransaction[],
  payer: Keypair
): Promise<string | undefined> => {
  try {
    console.log("======= BloxRoute Mode =======");

    // Append tip transaction
    const bundleTransactions = [...transactions];
    const tipTransaction = await createTipTransaction(payer);
    bundleTransactions.push(tipTransaction);

    // Convert transactions to base64 entries
    const entries = bundleTransactions.map((tx) => {
      const serializedTx = tx.serialize();
      const base64Content = Buffer.from(serializedTx).toString("base64");
      return {
        transaction: {
          content: base64Content,
        },
      };
    });

    const requestBody = { entries };

    if (!BLOXROUTE_AUTH_TOKEN) {
      throw new Error("BLOXROUTE_AUTH_TOKEN environment variable not set");
    }

    console.log(`Sending ${bundleTransactions.length} transactions via BloxRoute...`);

    const response: AxiosResponse = await axios.post(
      BLOXROUTE_SUBMIT_BATCH_URL,
      requestBody,
      {
        headers: {
          Authorization: BLOXROUTE_AUTH_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status >= 200 && response.status < 300) {
      const result = response.data?.transactions;
      console.log("BloxRoute bundle submitted successfully:", JSON.stringify(result));
      return JSON.stringify(result);
    } else {
      const errorText = response.data || "Unknown error";
      throw new Error(`BloxRoute API error: ${response.status} - ${errorText}`);
    }
  } catch (error: any) {
    if (error.response) {
      const errorText = error.response.data || "Unknown error";
      console.log(`BloxRoute API error: ${error.response.status} - ${JSON.stringify(errorText)}`);
    } else {
      console.log(`BloxRoute request failed: ${error.message}`);
    }
    return undefined;
  }
};
