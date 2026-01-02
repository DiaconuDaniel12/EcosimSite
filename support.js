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

const RPC_URL = (window.NEXT_PUBLIC_SOLANA_RPC || "").trim() || "https://api.mainnet-beta.solana.com";
const USDC_MINT_STR = (window.NEXT_PUBLIC_USDC_MINT || "").trim() || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_MINT = new PublicKey(USDC_MINT_STR);
const USDC_DECIMALS = 6;
const TREASURY_STR = (window.NEXT_PUBLIC_TREASURY_WALLET || "").trim() || "84QqigQqzLsyXMpuhaKKwhaY91D48MGhvBLQGWAZtbGd";
const TREASURY = new PublicKey(TREASURY_STR);
const MIN_USDC = Number((window.NEXT_PUBLIC_MIN_BUY_USDC || "").trim()) || 10;
const MAX_USDC = Number((window.NEXT_PUBLIC_MAX_BUY_USDC || "").trim()) || 5000;
const ECO_PER_USDC = 200; // indicative

const connection = new Connection(RPC_URL, "confirmed");

function getProvider() {
  if ("solana" in window) {
    const p = window.solana;
    if (p?.isPhantom) return p;
  }
  return null;
}

function attachModal(modal) {
  modal?.addEventListener("click", (e) => {
    if (e.target && e.target.dataset.close) closeModal(modal);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal(modal);
  });
}
function openModal(modal) {
  modal?.classList.add("show");
  modal?.setAttribute("aria-hidden", "false");
}
function closeModal(modal) {
  modal?.classList.remove("show");
  modal?.setAttribute("aria-hidden", "true");
}

function initFlow(prefix) {
  const btnOpen = document.getElementById(prefix === "support" ? "supportBtn" : "buyBtnHero");
  const modal = document.getElementById(prefix === "support" ? "supportModal" : "buyModal");
  const statusEl = document.getElementById(`${prefix}Status`);
  const connectBtn = document.getElementById(`${prefix}Connect`);
  const amountInput = document.getElementById(`${prefix}Amount`);
  const receiveEl = document.getElementById(`${prefix}Receive`);
  const payBtn = document.getElementById(`${prefix}Pay`);
  const resultEl = document.getElementById(`${prefix}Result`);

  let provider = null;
  let wallet = null;

  const setStatus = (msg, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? "#f88" : "var(--muted)";
  };

  const updateReceive = () => {
    const val = parseFloat(amountInput?.value || "0");
    if (isNaN(val) || val <= 0) {
      if (receiveEl) receiveEl.textContent = "0 ECO";
      return;
    }
    const eco = val * ECO_PER_USDC;
    if (receiveEl) receiveEl.textContent = `${eco.toLocaleString()} ECO`;
  };
  amountInput?.addEventListener("input", updateReceive);

  btnOpen?.addEventListener("click", () => {
    updateReceive();
    openModal(modal);
  });
  attachModal(modal);

  connectBtn?.addEventListener("click", async () => {
    provider = getProvider();
    if (!provider) {
      setStatus("Phantom not detected. Install Phantom.", true);
      if (resultEl) resultEl.innerHTML = `<a href="https://phantom.app" target="_blank" rel="noreferrer">Install Phantom</a>`;
      alert("Phantom wallet not detected. Please install Phantom and refresh.");
      return;
    }
    try {
      const res = await provider.connect({ onlyIfTrusted: false });
      wallet = res.publicKey || provider.publicKey;
      setStatus(`Connected: ${wallet.toString()}`);
      if (resultEl) resultEl.textContent = "";
    } catch (e) {
      console.error("Phantom connect error:", e);
      setStatus("Connection cancelled or failed.", true);
      alert("Connection cancelled or failed. Try again.");
    }
  });

  async function ensureAta(owner, mint, payer) {
    const ata = await getAssociatedTokenAddress(mint, owner, false);
    const info = await connection.getAccountInfo(ata);
    const ix = info
      ? null
      : createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
    return { ata, ix, exists: !!info };
  }

  payBtn?.addEventListener("click", async () => {
    if (!provider || !wallet) {
      setStatus("Connect Phantom first.", true);
      return;
    }
    const val = parseFloat(amountInput?.value || "0");
    if (isNaN(val) || val < MIN_USDC) {
      setStatus(`Minimum is ${MIN_USDC} USDC.`, true);
      return;
    }
    if (val > MAX_USDC) {
      setStatus(`Maximum is ${MAX_USDC} USDC.`, true);
      return;
    }
    const amountRaw = Math.round(val * 10 ** USDC_DECIMALS);
    if (amountRaw <= 0) {
      setStatus("Invalid amount.", true);
      return;
    }

    setStatus("Building transaction...");
    if (resultEl) resultEl.textContent = "";
    payBtn.disabled = true;

    try {
      const payer = wallet;
      const { ata: fromAta, exists: fromExists } = await ensureAta(payer, USDC_MINT, payer);
      if (!fromExists) {
        throw new Error("You need USDC in your wallet (USDC ATA missing).");
      }
      const { ata: toAta, ix: createToAta } = await ensureAta(TREASURY, USDC_MINT, payer);

      const tx = new Transaction();
      if (createToAta) tx.add(createToAta);

      tx.add(
        createTransferCheckedInstruction(
          fromAta,
          USDC_MINT,
          toAta,
          payer,
          amountRaw,
          USDC_DECIMALS
        )
      );

      tx.feePayer = payer;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      setStatus("Confirm in Phantom...");
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
      setStatus("Payment received. Thank you!");
      const link = `https://solscan.io/tx/${signature}`;
      if (resultEl) resultEl.innerHTML = `Signature: <a href="${link}" target="_blank" rel="noreferrer">${signature}</a>`;
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || err}`, true);
    } finally {
      payBtn.disabled = false;
    }
  });

  updateReceive();
}

// Init flows for buy and support (if elements exist)
initFlow("buy");
initFlow("support");
