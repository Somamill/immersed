// Node >=24 runs this pure TypeScript module directly. Share the iPhone parser
// so rolling updates, explicit clears and caption windows have one policy.
const { parseCaptionTrack } = require("../src/captions.ts");
module.exports = { parseYouTubeCaptions: parseCaptionTrack };
