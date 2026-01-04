// support.js - Phantom + USDC contribution (static)
import {
  Connection,
  PublicKey,
  Transaction,
} from "https://unpkg.com/@solana/web3.js@1.91.4/lib/index.browser.esm.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "https://unpkg.com/@solana/spl-token@0.3.11/lib/index.browser.esm.js";

const RPC_URL = "https://api.mainnet-beta.solana.com";
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TREASURY = new PublicKey("84QqigQqzLsyXMpuhaKKwhaY91D48MGhvBLQGWAZtbGd");
const USDC_DECIMALS = 6;
const MIN_USDC = 10;
const MAX_USDC = 5000;
const ECO_PER_USDC = 200; // indicative
const EST_FEE_SOL = 0.000005; // ~5k lamports typical transfer fee
const EXPLORER_BASE = "https://solscan.io/tx/";

const connection = new Connection(RPC_URL, "confirmed");

let provider = null;
let wallet = null;

const els = {
  status: document.getElementById("status"),
  connectBtn: document.getElementById("connectBtn"),
  amountInput: document.getElementById("amount"),
  receive: document.getElementById("receive"),
  fee: document.getElementById("feeEstimate"),
  payBtn: document.getElementById("payBtn"),
  result: document.getElementById("result"),
  treasury: document.getElementById("treasuryAddress"),
};

function setStatus(msg, isError = false) {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.style.color = isError ? "#f88" : "var(--muted)";
}

function getProvider() {
  if ("solana" in window) {
    const p = window.solana;
    if (p?.isPhantom) return p;
  }
  return null;
}

function updateReceive() {
  if (!els.receive || !els.amountInput) return;
  const val = parseFloat(els.amountInput.value || "0");
  if (isNaN(val) || val <= 0) {
    els.receive.textContent = "0 ECO";
    return;
  }
  const eco = val * ECO_PER_USDC;
  els.receive.textContent = `${eco.toLocaleString()} ECO`;
}

function updateFee() {
  if (els.fee) {
    els.fee.textContent = `Est. network fee: ≈ ${EST_FEE_SOL} SOL (varies)`;
  }
}

async function ensureAta(owner, mint, payer) {
  const ata = await getAssociatedTokenAddress(mint, owner, false);
  const info = await connection.getAccountInfo(ata);
  const ix = info ? null : createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
  return { ata, ix, exists: !!info };
}

function attachHandlers() {
  if (els.connectBtn) {
    els.connectBtn.addEventListener("click", async () => {
      provider = getProvider();
      if (!provider) {
        setStatus("Phantom nu este detectat. Instalează Phantom.", true);
        if (els.result) {
          els.result.innerHTML = `<a href="https://phantom.app" target="_blank" rel="noreferrer">Instalează Phantom</a>`;
        }
        return;
      }
      try {
        setStatus("Așteaptă aprobarea în Phantom...");
        const res = await (provider.connect
          ? provider.connect({ onlyIfTrusted: false })
          : provider.request({ method: "connect" }));
        wallet = res?.publicKey || provider.publicKey;
        if (!wallet) throw new Error("Nu am primit wallet din Phantom.");
        setStatus(`Conectat: ${wallet.toString()}`);
        if (els.result) els.result.textContent = "";
      } catch (e) {
        console.error("Phantom connect error:", e);
        setStatus("Conectarea a eșuat sau a fost anulată.", true);
      }
    });
  }

  els.amountInput?.addEventListener("input", updateReceive);

  if (els.payBtn) {
    els.payBtn.addEventListener("click", async () => {
      if (!provider || !wallet) {
        setStatus("Conectează Phantom mai întâi.", true);
        return;
      }
      const val = parseFloat(els.amountInput?.value || "0");
      if (isNaN(val) || val < MIN_USDC) {
        setStatus(`Suma minimă este ${MIN_USDC} USDC.`, true);
        return;
      }
      if (val > MAX_USDC) {
        setStatus(`Suma maximă este ${MAX_USDC} USDC.`, true);
        return;
      }
      const amountRaw = Math.round(val * 10 ** USDC_DECIMALS);
      if (amountRaw <= 0) {
        setStatus("Suma este invalidă.", true);
        return;
      }

      setStatus("Construiesc tranzacția...");
      if (els.result) els.result.textContent = "";
      els.payBtn.disabled = true;

      try {
        const payer = wallet;
        const { ata: fromAta, exists: fromExists } = await ensureAta(payer, USDC_MINT, payer);
        if (!fromExists) {
          throw new Error("Nu ai USDC în wallet (ATA lipsește).");
        }
        const { ata: toAta, ix: createToAta } = await ensureAta(TREASURY, USDC_MINT, payer);

        const tx = new Transaction();
        if (createToAta) tx.add(createToAta);

        tx.add(
          createTransferCheckedInstruction(fromAta, USDC_MINT, toAta, payer, amountRaw, USDC_DECIMALS)
        );

        tx.feePayer = payer;
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;

        setStatus("Confirmă în Phantom...");
        let signature = "";
        if (provider.signAndSendTransaction) {
          const res = await provider.signAndSendTransaction(tx);
          signature = res.signature || res;
        } else if (provider.signTransaction) {
          const signed = await provider.signTransaction(tx);
          signature = await connection.sendRawTransaction(signed.serialize());
        } else {
          throw new Error("Wallet-ul nu poate semna și trimite tranzacția.");
        }

        await connection.confirmTransaction(signature, "confirmed");
        setStatus("Plată trimisă. Mulțumim!");
        const link = `${EXPLORER_BASE}${signature}`;
        if (els.result) {
          els.result.innerHTML = `Signature: <a href="${link}" target="_blank" rel="noreferrer">${signature}</a>`;
        }
      } catch (err) {
        console.error(err);
        setStatus(`Eroare: ${err.message || err}`, true);
      } finally {
        els.payBtn.disabled = false;
      }
    });
  }
}

function init() {
  if (els.treasury) els.treasury.textContent = TREASURY.toString();
  updateReceive();
  updateFee();
  attachHandlers();
}

init();
