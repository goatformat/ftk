const os = require('os');

const hhmmss = (ms, round = true) => {
  let s = ms / 1000;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s - (h * 3600)) / 60);
  s = s - (h * 3600) - (m * 60);
  if (round) s = Math.round(s);

  const mm = m < 10 ? `0${m}` : `${m}`;
  const ss = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) {
    const hh = h < 10 ? `0${h}` : `${h}`;
    return `${hh}h${mm}m${ss}s`;
  } else {
    return `${mm}m${ss}s`;
  }
};

// Technically, storing 10M state strings (length ~68 = 12 + 4 * Math.ceil(68 /4) = 80 bytes) should
// require 800 MB, though if they're in a cons-string representation instead of flat strings they
// will use considerably more. Empirically allowing threads ~2 GB of memory each helps ensure we
// stay at around 75-85% utilization for the system and don't start swapping or crashing.
const maxWorkers = (cutoff) => Math.round(os.totalmem() / (200 * cutoff));

module.exports = {hhmmss, maxWorkers};
