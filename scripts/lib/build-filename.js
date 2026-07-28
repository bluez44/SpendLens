function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildApkFilename({ version, variant, date }) {
  const v = version && String(version).length > 0 ? version : 'unknown';
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `SpendLens-v${v}-${variant}-${y}-${mo}-${d}-${h}${mi}.apk`;
}

module.exports = { buildApkFilename };
