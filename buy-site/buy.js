import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const NETWORK = "mainnet-beta"; // switch to "devnet" if needed
const USDC_MINT =
  NETWORK === "mainnet-beta"
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "BXXkv6z8ykpGqxpnj6oJ4j5LZb5uMY15qbt7MUH3Y2bU"; // devnet USDC
const TREASURY = "84QqigQqzLsyXMpuhaKKwhaY91D48MGhvBLQGWAZtbGd";
const RPC_URL =
  NETWORK === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
const ECO_PER_USDC = 50000;
const USDC_DECIMALS = 6;

const firebaseConfig = {
  apiKey: "AIzaSyChsncNZ5qeqAosV4_QncIkoTyf6mmPz9o",
  authDomain: "ecosimsitebase.firebaseapp.com",
  projectId: "ecosimsitebase",
  storageBucket: "ecosimsitebase.firebasestorage.app",
  messagingSenderId: "918833539734",
  appId: "1:918833539734:web:cdc25a7a6ece864ffcb0b7",
  measurementId: "G-1QBL56VSW6"
};

const treasuryAddressEl = document.getElementById("treasuryAddress");
const walletPill = document.getElementById("walletPill");
const walletMini = document.getElementById("walletMini");
const totalBoughtEl = document.getElementById("totalBought");
const pointsEl = document.getElementById("points");
const usdcBalanceEl = document.getElementById("usdcBalance");
const lastTxEl = document.getElementById("lastTx");
const connStatusEl = document.getElementById("connStatus");
const resultEl = document.getElementById("result");
const connectBtn = document.getElementById("connectBtn");
const payBtn = document.getElementById("payBtn");
const copyBtn = document.getElementById("copyBtn");
const amountInput = document.getElementById("amount");
const feeEstimateEl = document.getElementById("feeEstimate");
const ecoEstimateEl = document.getElementById("ecoEstimate");

let firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const firestore = getFirestore(firebaseApp);

let currentWallet = null;
let currentUsdcBalance = null;
let currentUsdcAta = null;
let lastSignature = null;

const shorten = (addr) =>
  addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : "-";

const formatNumber = (val) =>
  typeof val === "number" ? val.toLocaleString() : "0";

const setMessage = (msg, color = "text-cyan-200") => {
  resultEl.className = `text-xs ${color}`;
  resultEl.textContent = msg;
};

const getEcoAmount = () => {
  const amt = Number(amountInput.value);
  if (!amt || amt <= 0) return 0;
  return Math.round(amt * ECO_PER_USDC);
};

const updateEcoEstimate = () => {
  const ecoAmount = getEcoAmount();
  ecoEstimateEl.textContent = ecoAmount
    ? `You receive: ${ecoAmount.toLocaleString()} ECO`
    : "You receive: - ECO";
};

const updateStatusUI = () => {
  const connected = !!currentWallet;
  const amt = Number(amountInput.value);
  const amountInvalid = !amt || amt < 1 || amt > 10 || Number.isNaN(amt) || !Number.isFinite(amt);
  walletPill.textContent = connected ? `Connected: ${shorten(currentWallet)}` : "Not connected";
  walletMini.textContent = connected ? currentWallet : "-";
  connStatusEl.textContent = connected ? "Connected ✅" : "Not connected";
  usdcBalanceEl.textContent = currentUsdcBalance === null ? "-" : `${currentUsdcBalance.toLocaleString()} USDC`;
  lastTxEl.textContent = lastSignature ? lastSignature : "-";
  const disableBuy = !connected || currentUsdcBalance === null || currentUsdcAta === null || amountInvalid;
  payBtn.disabled = disableBuy;
  payBtn.title = disableBuy ? "Connect wallet, load balance, amount 1-10 USDC" : "";
};

async function ensureUserDocument(walletAddress) {
  const ref = doc(firestore, "users", walletAddress);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    wallet: walletAddress,
    points: 0,
    totalBoughtEco: 0,
    purchaseCount: 0,
    lastPurchaseSig: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function loadUserStats(walletAddress) {
  const ref = doc(firestore, "users", walletAddress);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  totalBoughtEl.textContent = formatNumber(data.totalBoughtEco ?? 0);
  pointsEl.textContent = formatNumber(data.points ?? 0);
  if (data.lastPurchaseSig) {
    lastSignature = data.lastPurchaseSig;
    lastTxEl.textContent = lastSignature;
  }
}

async function fetchUsdcBalance() {
  if (!currentWallet || !window.solanaWeb3) return;
  try {
    const { Connection, PublicKey } = window.solanaWeb3;
    const connection = new Connection(RPC_URL, "confirmed");
    const owner = new PublicKey(currentWallet);
    const mint = new PublicKey(USDC_MINT);
    const resp = await connection.getParsedTokenAccountsByOwner(owner, {
      mint
    });
    let balance = 0;
    currentUsdcAta = null;
    if (resp.value && resp.value.length > 0) {
      const acct = resp.value[0];
      balance =
        acct.account.data.parsed.info.tokenAmount.uiAmount || 0;
      currentUsdcAta = acct.pubkey;
    }
    currentUsdcBalance = balance;
    updateStatusUI();
  } catch (err) {
    console.error("Balance fetch failed", err);
    currentUsdcBalance = null;
    currentUsdcAta = null;
    updateStatusUI();
    setMessage("Could not read USDC balance (RPC limit).", "text-amber-300");
  }
}

async function recordPurchase(walletAddress, ecoAmount, signature, amountUSDC) {
  const userRef = doc(firestore, "users", walletAddress);
  await updateDoc(userRef, {
    totalBoughtEco: increment(ecoAmount),
    purchaseCount: increment(1),
    lastPurchaseSig: signature,
    updatedAt: serverTimestamp()
  });
  await setDoc(doc(firestore, "purchases", signature), {
    wallet: walletAddress,
    amountUSDC,
    ecoAmount,
    signature,
    network: NETWORK,
    createdAt: serverTimestamp()
  });
}

async function connectPhantom() {
  if (!window?.solana?.isPhantom) {
    setMessage("Install Phantom to continue", "text-amber-300");
    return;
  }
  try {
    const res = await window.solana.connect();
    currentWallet = res.publicKey.toString();
    await ensureUserDocument(currentWallet);
    await loadUserStats(currentWallet);
    await fetchUsdcBalance();
    updateStatusUI();
    setMessage("Wallet connected", "text-cyan-200");
  } catch (err) {
    console.error(err);
    setMessage("Connect request was cancelled", "text-amber-300");
  }
}

function setupPercentButtons() {
  const pctButtons = document.querySelectorAll("[data-pct]");
  pctButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const pct = Number(btn.dataset.pct);
      const base = Number(amountInput.value) || 1;
      const next = Math.min(10, Math.max(1, +(base * (pct / 100)).toFixed(0)));
      amountInput.value = next || 1;
      updateEcoEstimate();
      updateStatusUI();
    });
  });
}

async function transferUsdc(amount, ownerPubkey, connection) {
  const {
    PublicKey,
    Transaction,
    TransactionInstruction
  } = window.solanaWeb3;

  const mint = new PublicKey(USDC_MINT);
  const tokenProgram = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );
  const assocProgram = new PublicKey(
    "ATokenGPvotb7GzndJ3JcQpW5dQqZ9F8s6sR2Z5iSGEP"
  );
  const treasury = new PublicKey(TREASURY);

  const findAta = (ownerPk) => {
    const [ata] = PublicKey.findProgramAddressSync(
      [ownerPk.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      assocProgram
    );
    return ata;
  };

  const userAta = new PublicKey(currentUsdcAta);
  const treasuryAta = findAta(treasury);

  // Build TransferChecked instruction
  const amountBase = Math.round(amount * 10 ** USDC_DECIMALS);
  const data = new Uint8Array(1 + 8 + 1);
  data[0] = 12; // TransferChecked
  const view = new DataView(data.buffer);
  const low = amountBase >>> 0;
  const high = (amountBase / 2 ** 32) >>> 0;
  view.setUint32(1, low, true);
  view.setUint32(5, high, true);
  data[9] = USDC_DECIMALS;

  const ix = new TransactionInstruction({
    programId: tokenProgram,
    keys: [
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: ownerPubkey, isSigner: true, isWritable: false }
    ],
    data
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = ownerPubkey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const { signature } = await window.solana.signAndSendTransaction(tx);
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return signature;
}

async function onBuy() {
  if (!currentWallet) {
    setMessage("Connect wallet first", "text-amber-300");
    return;
  }
  if (currentUsdcBalance === null || currentUsdcAta === null) {
    setMessage(
      "Cannot read USDC balance. Reconnect wallet and try again.",
      "text-amber-300"
    );
    return;
  }
  const amt = Number(amountInput.value);
  if (!amt || amt <= 0) {
    setMessage("Enter a valid amount", "text-amber-300");
    return;
  }
  if (amt < 1 || amt > 10) {
    setMessage("Amount must be between 1 and 10 USDC.", "text-amber-300");
    return;
  }
  if (amt > currentUsdcBalance) {
    setMessage("Not enough USDC. Top up your wallet.", "text-amber-300");
    return;
  }
  const ecoAmount = getEcoAmount();
  try {
    const { Connection, PublicKey } = window.solanaWeb3;
    const connection = new Connection(RPC_URL, "confirmed");
    const owner = new PublicKey(currentWallet);

    setMessage("Sending transaction...", "text-cyan-200");
    const sig = await transferUsdc(amt, owner, connection);
    lastSignature = sig;
    lastTxEl.textContent = sig;

    await recordPurchase(currentWallet, ecoAmount, sig, amt);
    await loadUserStats(currentWallet);
    await fetchUsdcBalance();

    setMessage(
      `Purchase confirmed. ${amt} USDC (~${ecoAmount} ECO). Sig: ${sig}`,
      "text-cyan-200"
    );
  } catch (err) {
    console.error(err);
    setMessage("Could not complete purchase", "text-rose-300");
  }
}

function copyPresale() {
  navigator.clipboard.writeText(TREASURY).then(() => {
    setMessage("Presale wallet copied", "text-cyan-200");
  });
}

function init() {
  treasuryAddressEl.textContent = TREASURY;
  feeEstimateEl.textContent = "Est. network fee: tiny SOL (for transactions)";
  updateStatusUI();
  connectBtn.addEventListener("click", () => connectPhantom());
  payBtn.addEventListener("click", () => onBuy());
  copyBtn.addEventListener("click", () => copyPresale());
  amountInput.addEventListener("input", () => {
    updateEcoEstimate();
    updateStatusUI();
  });
  setupPercentButtons();
  updateEcoEstimate();
}

init();


