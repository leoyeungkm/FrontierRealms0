// ─── zkLogin 社交登入（原生 @mysten/sui/zklogin，1.x，不需 Enoki/React）──
// Google 登入 → 取得 zkLogin 地址 + 臨時金鑰 → 可簽 mint/recolor 交易。
// 需要：VITE_GOOGLE_CLIENT_ID（OAuth）；未設定 → zkEnabled() false，整功能隱藏（優雅降級）。
// 注意：userSalt 在此用 localStorage 隨機鹽（demo 級）；正式環境應接 salt 服務。
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  generateNonce, generateRandomness, getExtendedEphemeralPublicKey,
  jwtToAddress, genAddressSeed, getZkLoginSignature, decodeJwt,
} from '@mysten/sui/zklogin';

const ENV = (k, d) => (import.meta.env && import.meta.env[k]) || d;
const GOOGLE_CLIENT_ID = ENV('VITE_GOOGLE_CLIENT_ID', '');
const PROVER = ENV('VITE_ZKLOGIN_PROVER', 'https://prover.testnet.sui.io/v1');
const SS = sessionStorage, LS = localStorage;

export function zkEnabled() { return GOOGLE_CLIENT_ID.length > 10; }

// ── 1. 發起 Google 登入（整頁跳轉）─────────────────────────────
export async function beginGoogleLogin(suiClient) {
  const eph = Ed25519Keypair.generate();
  const { epoch } = await suiClient.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 2;
  const randomness = generateRandomness();
  const nonce = generateNonce(eph.getPublicKey(), maxEpoch, randomness);
  // 暫存臨時金鑰/狀態（回跳後組裝證明用）
  SS.setItem('zk.eph', eph.getSecretKey());
  SS.setItem('zk.max', String(maxEpoch));
  SS.setItem('zk.rnd', randomness);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: location.origin + location.pathname,
    response_type: 'id_token',
    scope: 'openid',
    nonce,
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── 2. 回跳後完成登入（URL hash 帶 id_token）──────────────────
export async function tryCompleteZkLogin(suiClient) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const jwt = hash.get('id_token');
  if (!jwt) return null;
  history.replaceState(null, '', location.pathname);   // 清掉 hash

  const ephSecret = SS.getItem('zk.eph');
  const maxEpoch = Number(SS.getItem('zk.max'));
  const randomness = SS.getItem('zk.rnd');
  if (!ephSecret || !maxEpoch) return null;
  const eph = Ed25519Keypair.fromSecretKey(ephSecret);

  const claims = decodeJwt(jwt);
  const sub = claims.sub, aud = Array.isArray(claims.aud) ? claims.aud[0] : claims.aud;
  // demo 級 salt：每個 Google 帳號一個隨機鹽存 localStorage（正式應用 salt 服務）
  const saltKey = `fr0.zk.salt.${sub}`;
  let salt = LS.getItem(saltKey);
  if (!salt) { salt = generateRandomness(); LS.setItem(saltKey, salt); }

  const address = jwtToAddress(jwt, BigInt(salt));
  const extPk = getExtendedEphemeralPublicKey(eph.getPublicKey());

  // 向 prover 取 ZK 證明
  const proof = await fetch(PROVER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jwt, extendedEphemeralPublicKey: extPk, maxEpoch,
      jwtRandomness: randomness, salt, keyClaimName: 'sub',
    }),
  }).then(r => { if (!r.ok) throw new Error(`prover ${r.status}`); return r.json(); });

  const addressSeed = genAddressSeed(BigInt(salt), 'sub', sub, aud).toString();

  // 持久化 session（重整不用重登）
  const session = { address, jwt, salt, sub, aud, maxEpoch, ephSecret, proof, addressSeed };
  SS.setItem('zk.session', JSON.stringify(session));
  return _signer(session, suiClient);
}

// ── 重整後還原 session ───────────────────────────────────────
export function restoreZkSession(suiClient) {
  try {
    const s = JSON.parse(SS.getItem('zk.session') || 'null');
    return s ? _signer(s, suiClient) : null;
  } catch { return null; }
}

export function zkLogout() {
  ['zk.session', 'zk.eph', 'zk.max', 'zk.rnd'].forEach(k => SS.removeItem(k));
}

// ── 簽署器：用臨時金鑰簽 + 組 zkLogin 簽章 ─────────────────────
function _signer(session, suiClient) {
  const eph = Ed25519Keypair.fromSecretKey(session.ephSecret);
  return {
    address: session.address,
    mode: 'zklogin',
    async signAndExecuteTransaction({ transaction }) {
      transaction.setSender(session.address);
      const { bytes, signature: userSignature } = await transaction.sign({ client: suiClient, signer: eph });
      const zkSignature = getZkLoginSignature({
        inputs: { ...session.proof, addressSeed: session.addressSeed },
        maxEpoch: session.maxEpoch,
        userSignature,
      });
      return suiClient.executeTransactionBlock({
        transactionBlock: bytes, signature: zkSignature,
        options: { showEffects: true },
      });
    },
  };
}
