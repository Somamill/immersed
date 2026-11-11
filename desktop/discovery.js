/* Japanese discovery policy shared by the Mac interface and search service. */
(function (root) {
  const conversation = /ポッドキャスト|podcast|対談|対話|インタビュー|interview|座談|会話|トーク|talk|討論|講演|講義|ラジオ|radio/i;
  const nonSpeech = /作業用|睡眠用|bgm|lofi|lo-fi|歌ってみた|踊ってみた|ゲーム実況|プレイ動画|music video|official mv|ミュージックビデオ|カラオケ/i;
  const learner = /日本語(?:学習|勉強|レッスン|ポッドキャスト|会話練習)|JLPT|Japanese (?:listening|learning|practice)|learn(?:ing)? Japanese|for N[1-5]|Speak Japanese Naturally/i;
  function options(value = {}) {
    return {
      conversation: value.conversation === true,
      nativeAudience: value.nativeAudience === true,
      minimumMinutes: [15, 30, 60].includes(Number(value.minimumMinutes)) ? Number(value.minimumMinutes) : 0,
      hideShorts: value.hideShorts !== false,
    };
  }
  function queryFor(query, value) {
    const prefs = options(value);
    return query + (prefs.conversation ? (conversation.test(query) ? "" : " 対談") + " -作業用 -睡眠用 -BGM -ゲーム実況" : "") +
      (prefs.nativeAudience ? " -日本語学習 -日本語勉強 -JLPT -日本語ポッドキャスト -日本語レッスン" : "");
  }

  function eligible(item, value) {
    const prefs = options(value), title = item.title || "";
    return (!prefs.hideShorts || !item.isShort) &&
      Number(item.duration) >= prefs.minimumMinutes * 60 &&
      (!prefs.conversation || !nonSpeech.test(title) || conversation.test(title)) &&
      (!prefs.nativeAudience || !learner.test(title + " " + (item.channel || "")));
  }
  function score(item) {
    return (conversation.test(item.title || "") ? 3 : 0) +
      (conversation.test(item.channel || "") ? 1 : 0);
  }
  const api = { options, queryFor, eligible, score };
  if (typeof module === "object") module.exports = api;
  else root.ImmersedDiscovery = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
