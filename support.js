// support.js - Phantom + USDC contribution (static)
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "https://unpkg.com/@solana/web3.js@1.95.3/lib/index.browser.esm.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "https://unpkg.com/@solana/spl-token@0.3.11/index.browser.esm.js";

const RPC_URL = "https://api.mainnet-beta.solana.com";
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;
const TREASURY = new PublicKey("84QqigQqzLsyXMpuhaKKwhaY91D48MGhvBLQGWAZtbGd");
const MIN_USDC = 10;
const ECO_PER_USDC = 200; // indicative

const supportBtnHero = document.getElementById("supportBtn") || document.getElementById("supportBtnHero");
const supportModal = document.getElementById("supportModal");
const statusEl = document.getElementById("supportStatus");
const connectBtn = document.getElementById("supportConnect");
const amountInput = document.getElementById("supportAmount");
const receiveEl = document.getElementById("supportReceive");
const payBtn = document.getElementById("supportPay");
const resultEl = document.getElementById("supportResult");
const ecoMintEl = document.getElementById("supportEcoMint");
const vestingLink = document.getElementById("supportVestingLink");

const ecoMintEnv = window.supportEcoMint || (window.NEXT_PUBLIC_ECO_MINT || "").trim();
const vestingEnv = window.supportVesting || (window.NEXT_PUBLIC_SEED_VESTING_URL || "").trim();
if (ecoMintEl) ecoMintEl.textContent = ecoMintEnv || "not set";
if (vestingLink && vestingEnv) vestingLink.href = vestingEnv;

let provider = null;
let connection = new Connection(RPC_URL, "confirmed");
let walletPubkey = null;

function openModal() {
  supportModal?.classList.add("show");
  supportModal?.setAttribute("aria-hidden", "false");
  updateReceive();
}
function closeModal() {
  supportModal?.classList.remove("show");
  supportModal?.setAttribute("aria-hidden", "true");
}
supportModal?.addEventListener("click", (e) => {
  if (e.target && e.target.dataset.close) closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
supportBtnHero?.addEventListener("click", openModal);

function getProvider() {
  if ("solana" in window) {
    const p = window.solana;
    if (p?.isPhantom) return p;
  }
  return null;
}

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#f88" : "var(--muted)";
}

function updateReceive() {
  const val = parseFloat(amountInput?.value || "0");
  if (isNaN(val) || val <= 0) {
    receiveEl.textContent = "0 ECO";
    return;
  }
  const eco = val * ECO_PER_USDC;
  receiveEl.textContent = `${eco.toLocaleString()} ECO`;
}
amountInput?.addEventListener("input", updateReceive);

async function connectWallet() {
  provider = getProvider();
  if (!provider) {
    setStatus("Phantom not detected. Install Phantom.", true);
    return;
  }
  try {
    const res = await provider.connect();
    walletPubkey = res.publicKey || provider.publicKey;
    setStatus(`Connected: ${walletPubkey.toString()}`);
    if (resultEl) resultEl.textContent = "";
  } catch (e) {
    setStatus("Connection cancelled.", true);
  }
}
connectBtn?.addEventListener("click", connectWallet);

async function ensureAta(owner, mint, payer) {
  const ata = await getAssociatedTokenAddress(mint, owner, false);
  const info = await connection.getAccountInfo(ata);
  const ix = info
    ? null
    : createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
  return { ata, ix };
}

async function submitSupport() {
  if (!provider || !walletPubkey) {
    setStatus("Connect Phantom first.", true);
    return;
  }
  const val = parseFloat(amountInput?.value || "0");
  if (isNaN(val) || val < MIN_USDC) {
    setStatus(`Minimum is ${MIN_USDC} USDC.`, true);
    return;
  }
  const amount = Math.round(val * 10 ** USDC_DECIMALS);
  if (amount <= 0) {
    setStatus("Invalid amount.", true);
    return;
  }
  setStatus("Building transaction...");
  resultEl.textContent = "";

  try {
    const from = walletPubkey;
    const { ata: fromAta } = await ensureAta(from, USDC_MINT, from);
    const { ata: toAta, ix: createToAta } = await ensureAta(TREASURY, USDC_MINT, from);

    const tx = new Transaction();
    if (createToAta) tx.add(createToAta);
    tx.add(
      createTransferCheckedInstruction(
        fromAta,
        USDC_MINT,
        toAta,
        from,
        amount,
        USDC_DECIMALS
      )
    );

    tx.feePayer = from;
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;

    let signature = "";
    if (provider.signAndSendTransaction) {
      const res = await provider.signAndSendTransaction(tx);
      signature = res.signature || res;
    } else if (provider.signTransaction) {
      const signed = await provider.signTransaction(tx);
      signature = await connection.sendRawTransaction(signed.serialize());
    } else {
      throw new Error("Wallet does not support sending transactions.");
    }

    await connection.confirmTransaction(signature, "confirmed");
    setStatus("Contribution sent! Thank you.");
    const link = `https://solscan.io/tx/${signature}`;
    resultEl.innerHTML = `Signature: <a href="${link}" target="_blank" rel="noreferrer">${signature}</a>`;
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message || err}`, true);
  }
}
payBtn?.addEventListener("click", submitSupport);

// initial receive display
updateReceive();
