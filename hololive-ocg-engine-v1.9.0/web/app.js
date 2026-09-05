"use strict";

const COMMANDS = ["HAND", "BACKSTAGE", "ARCHIVE", "LOG", "STEP"];
const BATTLE_ROWS = ["P2_BACK", "P2", "P1", "P1_BACK", "COMMAND"];
const THEMES = [
  { id: "classic", label: "CLASSIC WHITE" },
  { id: "mint", label: "RETRO MINT" },
  { id: "moonlight", label: "MOONLIGHT" },
];
const ids = [
  "boot", "boot-menu", "press-start", "story-button", "vs-ai-button", "options-button", "exit-button",
  "deck-select", "deck-options", "deck-back", "options-screen", "options-menu", "options-theme-row", "options-bgm-row", "options-sfx-row", "options-back",
  "theme-value", "bgm-value", "sfx-value", "oshi-select", "oshi-options", "oshi-back", "flow-screen", "flow-title", "flow-step", "flow-message", "flow-body",
  "flow-actions", "flow-help", "battle", "turn-label", "phase-label", "active-label", "opponent-summary", "opponent-field", "opponent-backstage-peek",
  "event-message", "player-summary", "player-field", "player-backstage-peek", "command-menu", "menu-dialog", "dialog-title", "dialog-count", "dialog-list", "dialog-back",
  "dialog-zone-toggle", "dialog-sort", "card-detail", "dialog-help", "action-playback", "playback-stage", "playback-visual", "playback-speaker", "playback-text", "playback-help",
  "inspect-dialog", "inspect-image", "inspect-name", "title-music", "battle-music", "music-toggle",
  "game-over", "result-title", "result-reason", "rematch-button", "forfeit-dialog", "forfeit-no", "forfeit-yes",
  "step-dialog", "step-confirm-message", "step-no", "step-yes", "exited-screen", "toast",
];
const ui = Object.fromEntries(ids.map(id => [id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), document.getElementById(id)]));

let model = null;
let screen = "BOOT";
let busy = false;
let commandIndex = 0;
let battleFocus = "COMMAND";
let stageFocusIndex = { P1: 0, P2: 0, P1_BACK: 0, P2_BACK: 0 };
let bootIndex = 1;
let titleStarted = false;
let titleIntroTimer = null;
let deckIndex = 0;
let selectedDeckId = "hSD01";
let optionsIndex = 0;
let confirmIndex = 0;
let stepConfirmIndex = 0;
let oshiIndex = 0;
let flowIndex = 0;
let flowActionIndex = 0;
let flowItems = [];
let flowSelected = new Set();
let bottomOrder = [];
let dialogStack = [];
let tableTargetMode = null;
let advancePlayback = null;
let musicEnabled = true;
let handDisplayOrder = null;
let handDisplaySorted = false;
let sfxContext = null;
let themeIndex = Math.max(0, THEMES.findIndex(theme => theme.id === readSavedTheme()));
let bgmLevel = readSavedLevel("hololive-ocg-bgm-level", 10);
let sfxLevel = readSavedLevel("hololive-ocg-sfx-level", 10);

[ui.titleMusic, ui.battleMusic].forEach(track => { track.volume = bgmLevel / 10; });

function readSavedTheme() {
  try { return window.localStorage.getItem("hololive-ocg-theme") ?? "classic"; }
  catch { return "classic"; }
}

function readSavedLevel(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    const value = Number(stored);
    return Number.isFinite(value) ? Math.max(0, Math.min(10, Math.round(value))) : fallback;
  } catch { return fallback; }
}

function applyTheme() {
  const theme = THEMES[themeIndex] ?? THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  ui.themeValue.textContent = theme.label;
  try { window.localStorage.setItem("hololive-ocg-theme", theme.id); }
  catch { /* Theme still applies for this session. */ }
}

function cycleTheme(delta = 1) {
  themeIndex = (themeIndex + THEMES.length + delta) % THEMES.length;
  applyTheme();
  renderOptions();
}

function setAudioLevel(kind, delta) {
  if (kind === "bgm") {
    bgmLevel = Math.max(0, Math.min(10, bgmLevel + delta));
    [ui.titleMusic, ui.battleMusic].forEach(track => { track.volume = bgmLevel / 10; });
    try { window.localStorage.setItem("hololive-ocg-bgm-level", String(bgmLevel)); } catch { /* Session setting remains active. */ }
    if (bgmLevel > 0 && musicEnabled) startMusic();
  } else {
    sfxLevel = Math.max(0, Math.min(10, sfxLevel + delta));
    try { window.localStorage.setItem("hololive-ocg-sfx-level", String(sfxLevel)); } catch { /* Session setting remains active. */ }
    if (sfxLevel > 0) playTone(520, 0.06, "square", 0.04, 0, 720);
  }
  renderOptions();
  updateMusicButton();
}

function updateMusicButton() {
  const active = activeMusicTrack();
  ui.musicToggle.textContent = musicEnabled && active && !active.paused ? "♫" : "♪×";
  ui.musicToggle.title = musicEnabled ? "Mute music" : "Play music";
}

function activeMusicTrack() {
  if (screen === "EXITED") return null;
  const titleScreen = ["BOOT", "DECK_SELECT", "OPTIONS", "OSHI_SELECT"].includes(screen)
    || (model?.flow && model.flow.step !== "PLAYING");
  return titleScreen ? ui.titleMusic : ui.battleMusic;
}

function startMusic() {
  if (!musicEnabled || bgmLevel === 0) return;
  const active = activeMusicTrack();
  if (!active) return;
  const inactive = active === ui.titleMusic ? ui.battleMusic : ui.titleMusic;
  inactive.pause();
  if (!active.paused) return updateMusicButton();
  active.play().then(updateMusicButton).catch(() => updateMusicButton());
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  if (musicEnabled) startMusic();
  else [ui.titleMusic, ui.battleMusic].forEach(track => track.pause());
  updateMusicButton();
}

function unlockSfx() {
  try {
    if (!sfxContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      sfxContext = new AudioContextClass();
    }
    if (sfxContext.state === "suspended") sfxContext.resume();
    return sfxContext;
  } catch { return null; }
}

function playTone(frequency, duration = 0.1, type = "square", volume = 0.055, delay = 0, endFrequency = frequency) {
  if (sfxLevel === 0) return;
  const context = unlockSfx();
  if (!context) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  gain.gain.setValueAtTime(volume * sfxLevel / 10, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function playNoise(duration = 0.12, volume = 0.035, delay = 0, filterFrequency = 1800) {
  if (sfxLevel === 0) return;
  const context = unlockSfx();
  if (!context) return;
  const start = context.currentTime + delay;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = filterFrequency;
  gain.gain.setValueAtTime(volume * sfxLevel / 10, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(start);
}

function playAttackSfx(color) {
  switch (String(color).toLowerCase()) {
    case "white":
      playTone(880, 0.16, "sine", 0.07, 0, 1760);
      playTone(1320, 0.1, "square", 0.025, 0.035, 2100);
      break;
    case "green":
      playNoise(0.22, 0.05, 0, 1200);
      playTone(420, 0.16, "triangle", 0.035, 0.04, 620);
      break;
    case "red":
      playNoise(0.11, 0.05, 0, 900);
      playTone(180, 0.18, "sawtooth", 0.055, 0, 70);
      break;
    case "blue":
      playTone(520, 0.2, "sine", 0.055, 0, 260);
      playTone(780, 0.13, "triangle", 0.03, 0.04, 460);
      break;
    case "purple":
      playTone(260, 0.25, "sine", 0.055, 0, 520);
      playTone(390, 0.2, "triangle", 0.025, 0.03, 195);
      break;
    case "yellow":
      for (let index = 0; index < 4; index++) playTone(1200 + index * 180, 0.035, "square", 0.035, index * 0.035, 650);
      break;
    default:
      playNoise(0.08, 0.045, 0, 700);
      playTone(150, 0.1, "square", 0.04, 0, 80);
  }
}

function playPlaybackSfx(event) {
  const data = event.data ?? {};
  if (event.event === "SHUFFLE" || event.event === "SUB_PC_BOTTOM") {
    for (let index = 0; index < 5; index++) playNoise(0.09, 0.025, index * 0.085, 2400);
  } else if (event.event === "ART") {
    const color = data.attackerColor ?? card(data.attackerCardId)?.colors?.[0] ?? "Neutral";
    window.setTimeout(() => playAttackSfx(color), 340);
  } else if (event.event === "DRAW") {
    const count = Math.min(5, Math.max(1, Number(data.drawn ?? 1)));
    for (let index = 0; index < count; index++) playTone(300 + index * 35, 0.055, "triangle", 0.025, index * 0.12, 420 + index * 35);
  } else if (event.event === "DIE_ROLL" || event.event === "DIE_REPLACED") {
    for (let index = 0; index < 4; index++) playTone(260 + index * 70, 0.035, "square", 0.025, index * 0.045);
  } else if (event.event === "ARCHIVE_CHEERS_ATTACHED" || event.event === "CHEER_REATTACHED" || event.event === "EFFECT_SEND_CHEER" || event.event === "CHEER_ATTACHED") {
    const count = Math.max(1, Math.min(5, Number(data.count ?? 1)));
    for (let index = 0; index < count; index++) playTone(520 + index * 90, 0.09, "sine", 0.035, index * 0.07, 690 + index * 90);
  } else if (["PLACE_HOLOMEM", "BLOOM", "COLLAB", "COLLAB_RETURNED", "BATON_PASS", "PLAY_SUPPORT", "OSHI_SKILL"].includes(event.event)) {
    playTone(220, 0.07, "square", 0.03, 0, 330);
    playTone(440, 0.08, "triangle", 0.025, 0.065, 560);
  }
}

function resizeGame() {
  const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / 480, window.innerHeight / 270)));
  document.documentElement.style.setProperty("--scale", String(scale));
}
window.addEventListener("resize", resizeGame);
resizeGame();

async function api(route, payload) {
  const options = payload === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  };
  const response = await fetch(route, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The game server rejected the request.");
  return result;
}

function card(cardId) { return model?.cards?.[cardId]; }
function topCard(holomem) { return holomem ? card(holomem.stack.at(-1).cardId) : null; }
function imagePath(definition) {
  if (!definition?.image) return "";
  const relative = definition.image.replace(/^\//, "");
  return relative.includes("/") ? `/${relative}` : `/assets/cards/primary/${relative}`;
}
function cheerIconPath(color) { return `/assets/ui/cheer/${color || "Neutral"}.png`; }
function requirementIcons(colors = []) {
  return `<span class="art-cost" aria-label="Cost: ${escapeHtml(colors.join(", "))}">${colors.map(color => `<img class="requirement-icon" src="${cheerIconPath(color)}" title="${escapeHtml(color)} Cheer" alt="${escapeHtml(color)}">`).join("")}</span>`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.remove("hidden");
  window.setTimeout(() => ui.toast.classList.add("hidden"), 2500);
}

function showScreen(next) {
  screen = next;
  ui.boot.classList.toggle("hidden", next !== "BOOT");
  ui.deckSelect.classList.toggle("hidden", next !== "DECK_SELECT");
  ui.optionsScreen.classList.toggle("hidden", next !== "OPTIONS");
  ui.oshiSelect.classList.toggle("hidden", next !== "OSHI_SELECT");
  ui.flowScreen.classList.toggle("hidden", next !== "FLOW");
  ui.battle.classList.toggle("hidden", !["BATTLE", "DIALOG", "INSPECT", "FLOW", "PLAYBACK", "GAME_OVER", "FORFEIT", "STEP_CONFIRM"].includes(next) || (next === "FLOW" && !model?.state));
  ui.menuDialog.classList.toggle("hidden", next !== "DIALOG");
  ui.inspectDialog.classList.toggle("hidden", next !== "INSPECT");
  ui.gameOver.classList.toggle("hidden", next !== "GAME_OVER");
  ui.forfeitDialog.classList.toggle("hidden", next !== "FORFEIT");
  ui.stepDialog.classList.toggle("hidden", next !== "STEP_CONFIRM");
  ui.exitedScreen.classList.toggle("hidden", next !== "EXITED");
  startMusic();
}

function renderBootMenu() {
  [...ui.bootMenu.querySelectorAll("button")].forEach((button, index) => button.classList.toggle("selected", index === bootIndex && !button.disabled));
}

function beginTitleMenu() {
  if (titleStarted) return;
  titleStarted = true;
  if (titleIntroTimer) window.clearTimeout(titleIntroTimer);
  titleIntroTimer = null;
  ui.boot.classList.remove("awaiting-start", "intro-playing");
  ui.boot.classList.add("title-started");
  window.setTimeout(() => ui.boot.classList.remove("title-started"), 400);
  renderBootMenu();
  startMusic();
}

function scheduleTitleIntroEnd() {
  if (titleIntroTimer) window.clearTimeout(titleIntroTimer);
  titleIntroTimer = window.setTimeout(() => {
    ui.boot.classList.remove("intro-playing");
    titleIntroTimer = null;
  }, 2700);
}

function restartTitleIntro() {
  titleStarted = false;
  ui.boot.classList.remove("awaiting-start", "intro-playing", "title-started");
  void ui.boot.offsetWidth;
  ui.boot.classList.add("awaiting-start", "intro-playing");
  scheduleTitleIntroEnd();
}

function moveBoot(delta) {
  const buttons = [...ui.bootMenu.querySelectorAll("button")];
  do { bootIndex = (bootIndex + buttons.length + delta) % buttons.length; }
  while (buttons[bootIndex]?.disabled);
  renderBootMenu();
}

function selectedDeck() {
  return model?.deckOptions?.[deckIndex] ?? model?.deckOptions?.find(deck => deck.id === selectedDeckId);
}

function renderDeckSelect() {
  const decks = model?.deckOptions ?? [];
  if (decks.length) deckIndex = Math.max(0, Math.min(deckIndex, decks.length - 1));
  ui.deckOptions.replaceChildren(...decks.map((deck, index) => {
    const button = document.createElement("button");
    button.className = `deck-choice${index === deckIndex ? " selected" : ""}`;
    button.innerHTML = `<span class="deck-box-sprite"><img src="/assets/ui/BackB.png" alt=""></span><span class="deck-choice-copy"><strong>${escapeHtml(deck.name)}</strong><span>50 MAIN · 20 CHEER · 2 OSHI OPTIONS</span></span>`;
    button.addEventListener("mouseenter", () => {
      deckIndex = index;
      [...ui.deckOptions.children].forEach((child, childIndex) => child.classList.toggle("selected", childIndex === deckIndex));
    });
    button.addEventListener("click", () => { deckIndex = index; selectedDeckId = deck.id; enterOshiSelect(); });
    return button;
  }));
}

async function enterDeckSelect() {
  startMusic();
  try {
    model = await api("/api/state");
    const index = model.deckOptions?.findIndex(deck => deck.id === selectedDeckId) ?? -1;
    deckIndex = index >= 0 ? index : 0;
    showScreen("DECK_SELECT");
    renderDeckSelect();
  } catch (error) { showToast(error.message); }
}

function renderOptions() {
  const rows = [ui.optionsThemeRow, ui.optionsBgmRow, ui.optionsSfxRow, ui.optionsBack];
  rows.forEach((row, index) => row.classList.toggle("selected", index === optionsIndex));
  ui.themeValue.textContent = (THEMES[themeIndex] ?? THEMES[0]).label;
  ui.bgmValue.textContent = `${bgmLevel * 10}%`;
  ui.sfxValue.textContent = `${sfxLevel * 10}%`;
}

function enterOptions() {
  startMusic();
  optionsIndex = 0;
  showScreen("OPTIONS");
  renderOptions();
}

function adjustSelectedOption(delta) {
  if (optionsIndex === 0) cycleTheme(delta);
  else if (optionsIndex === 1) setAudioLevel("bgm", delta);
  else if (optionsIndex === 2) setAudioLevel("sfx", delta);
}

function renderForfeitChoice() {
  [ui.forfeitNo, ui.forfeitYes].forEach((button, index) => button.classList.toggle("selected", index === confirmIndex));
}

function renderStepConfirmChoice() {
  [ui.stepNo, ui.stepYes].forEach((button, index) => button.classList.toggle("selected", index === stepConfirmIndex));
}

function renderOshiSelect() {
  const options = selectedDeck()?.oshiOptions ?? model?.oshiOptions ?? ["hSD01-001", "hSD01-002"];
  ui.oshiOptions.replaceChildren(...options.map((id, index) => {
    const definition = card(id);
    const button = document.createElement("button");
    button.className = `oshi-choice${index === oshiIndex ? " selected" : ""}`;
    button.innerHTML = `<img src="${imagePath(definition)}" alt=""><strong>${escapeHtml(definition?.name ?? id)}</strong><span>${definition?.life ?? "?"} LIFE</span>`;
    button.addEventListener("click", () => { oshiIndex = index; renderOshiSelect(); startPregame(); });
    return button;
  }));
}

async function enterOshiSelect() {
  startMusic();
  try {
    if (!model?.deckOptions) model = await api("/api/state");
    showScreen("OSHI_SELECT");
    oshiIndex = 0;
    renderOshiSelect();
  } catch (error) { showToast(error.message); }
}

async function startPregame() {
  if (busy) return;
  busy = true;
  try {
    const deck = selectedDeck();
    model = await api("/api/new-game", { deckId: deck?.id ?? selectedDeckId, playerOshiId: deck?.oshiOptions?.[oshiIndex] ?? model.oshiOptions[oshiIndex] });
    battleFocus = "COMMAND";
    handDisplayOrder = null;
    handDisplaySorted = false;
    stageFocusIndex = { P1: 0, P2: 0, P1_BACK: 0, P2_BACK: 0 };
    resetFlowSelection();
    renderFlow();
  } catch (error) { showToast(error.message); }
  finally { busy = false; }
}

function resetFlowSelection() {
  flowIndex = 0;
  flowActionIndex = 0;
  flowSelected = new Set();
  bottomOrder = [];
}

function flowButton(label, handler, primary = false) {
  const button = document.createElement("button");
  button.className = `flow-button${primary ? " primary" : ""}`;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function setFlowActions(actions) {
  if (actions.length) flowActionIndex = Math.min(flowActionIndex, actions.length - 1);
  actions.forEach((button, index) => {
    button.classList.toggle("selected", index === flowActionIndex);
    button.addEventListener("pointerdown", () => { flowActionIndex = index; });
    button.addEventListener("mouseenter", () => {
      flowActionIndex = index;
      [...ui.flowActions.children].forEach((child, childIndex) => child.classList.toggle("selected", childIndex === flowActionIndex));
    });
  });
  ui.flowActions.replaceChildren(...actions);
}

function cardStatusHtml(status, definition) {
  if (!status?.holomem) return "";
  const holomem = status.holomem;
  const hp = definition?.hp ?? "?";
  const state = holomem.resting ? "RESTING" : "ACTIVE";
  return `<div class="detail-status"><div><span>POSITION</span><strong>${escapeHtml(status.zone ?? "STAGE")}</strong></div><div><span>STATE</span><strong>${state}</strong></div><div><span>DAMAGE</span><strong>${holomem.damage ?? 0} / ${hp}</strong></div><div><span>STACK</span><strong>${holomem.stack?.length ?? 1}</strong></div><div class="detail-cheer"><span>CHEER (${holomem.cheers?.length ?? 0})</span>${cheerIcons(holomem)}</div></div>`;
}

function cardDetailHtml(definition, extra = "", status = null) {
  if (!definition) return "<div class='detail-text'>Select a card to inspect it.</div>";
  const arts = (definition.arts ?? []).map(art => `<div class="art-detail-row">${requirementIcons(art.cost)}<span><strong>${escapeHtml(art.name)} · ${art.damage}</strong>${art.printedText ? `<br>${escapeHtml(art.printedText)}` : ""}</span></div>`).join("");
  const abilities = (definition.abilities ?? []).map(ability => {
    const powerCost = Number.isFinite(ability.holoPowerCost) ? `<span class="power-cost">HOLO POWER COST: ${ability.holoPowerCost}</span>` : "";
    const usage = ability.usage ? `<span class="ability-usage">${escapeHtml(ability.usage)}</span>` : "";
    return `<strong>[${escapeHtml(String(ability.kind ?? "ability").toUpperCase())}] ${escapeHtml(ability.name)}</strong>${powerCost}${usage}<br>${escapeHtml(ability.printedText)}`;
  }).join("<br>");
  const text = `${abilities ? `<div class="detail-section"><span class="detail-label">ABILITIES</span><br>${abilities}</div>` : ""}${arts ? `<div class="detail-section"><span class="detail-label">ARTS</span><br>${arts}</div>` : ""}`;
  const hp = definition.hp ? `HP ${definition.hp}` : definition.life ? `LIFE ${definition.life}` : definition.supportType ?? definition.type;
  return `<div class="detail-top"><img src="${imagePath(definition)}" alt=""><div><div class="detail-name">${escapeHtml(definition.name)}</div><div class="detail-lines">${definition.type}<br>${definition.bloomLevel ?? ""}<br>${hp}<br>${definition.colors?.join("/") ?? ""}</div></div></div>${cardStatusHtml(status, definition)}<div class="detail-text">${text || "No printed action text."}</div>${extra}`;
}

function renderFlowCardList(items, multi = false, ordered = false, activateOnClick = false) {
  flowItems = items;
  if (flowItems.length && flowIndex >= flowItems.length) flowIndex = flowItems.length - 1;
  if (flowItems[flowIndex]?.disabled) {
    const firstSelectable = flowItems.findIndex(item => !item.disabled);
    if (firstSelectable >= 0) flowIndex = firstSelectable;
  }
  const list = document.createElement("div");
  list.className = "flow-card-list";
  items.forEach((item, index) => {
    const row = document.createElement("button");
    const chosen = flowSelected.has(item.uid) || bottomOrder.includes(item.uid);
    row.className = `flow-card-row${index === flowIndex ? " selected" : ""}${chosen ? " chosen" : ""}${item.disabled ? " disabled" : ""}${item.indented ? " indented" : ""}${item.heading ? " heading" : ""}`;
    const order = bottomOrder.indexOf(item.uid);
    row.innerHTML = `<span>${index === flowIndex ? "▶" : ""}</span><span>${escapeHtml(item.name)}</span><span>${ordered && order >= 0 ? `BOTTOM ${order + 1}` : chosen ? "SELECTED" : escapeHtml(item.tag ?? "")}</span>`;
    row.addEventListener("mouseenter", () => selectFlowCard(index, items, list, detail));
    row.addEventListener("click", () => {
      flowIndex = index;
      if (multi && !item.disabled) toggleFlowCard(item.uid, ordered);
      else {
        selectFlowCard(index, items, list, detail);
        if (activateOnClick && !item.disabled) ui.flowActions.children[0]?.click();
      }
    });
    list.append(row);
  });
  const detail = document.createElement("aside");
  detail.className = "card-detail flow-card-detail";
  const selected = items[flowIndex];
  detail.innerHTML = cardDetailHtml(card(selected?.cardId), "", selected?.holomem ? { holomem: selected.holomem, zone: selected.zone } : null);
  const columns = document.createElement("div");
  columns.className = "flow-columns";
  columns.append(list, detail);
  ui.flowBody.replaceChildren(columns);
}

function currentFlowItem() {
  return flowItems[flowIndex] ?? null;
}

function selectFlowCard(index, items, list, detail) {
  flowIndex = index;
  [...list.children].forEach((row, rowIndex) => {
    row.classList.toggle("selected", rowIndex === index);
    row.children[0].textContent = rowIndex === index ? "▶" : "";
  });
  const selected = items[index];
  detail.innerHTML = cardDetailHtml(card(selected?.cardId), "", selected?.holomem ? { holomem: selected.holomem, zone: selected.zone } : null);
}

function toggleFlowCard(uid, ordered = false) {
  if (ordered) {
    const index = bottomOrder.indexOf(uid);
    if (index >= 0) bottomOrder.splice(index, 1);
    else bottomOrder.push(uid);
  } else if (flowSelected.has(uid)) flowSelected.delete(uid);
  else flowSelected.add(uid);
  renderFlow();
}

function handFlowItems(filter = () => true) {
  return (model.state?.players.P1.hand ?? []).filter(filter).map(instance => {
    const definition = card(instance.cardId);
    return { uid: instance.uid, cardId: instance.cardId, name: definition.name, tag: definition.bloomLevel ?? definition.type };
  });
}

function hasOpeningDebut() {
  return handFlowItems(item => card(item.cardId)?.type === "Holomem" && card(item.cardId)?.bloomLevel === "Debut").length > 0;
}

const PLAYBACK_EVENTS = new Set([
  "TURN_START", "DRAW", "RESET_COLLAB", "CHEER_REVEALED", "CHEER_EMPTY", "CHEER_ATTACHED",
  "PLACE_HOLOMEM", "NORMAL_PC_PLACE", "BLOOM", "COLLAB", "BATON_PASS", "OSHI_SKILL", "PLAY_SUPPORT", "SHUFFLE",
  "SUB_PC_TAKE", "SUB_PC_SKIP", "SUB_PC_BOTTOM", "DIE_REPLACED", "DIE_ROLL", "EFFECT_CHEER_REVEALED", "EFFECT_SEND_CHEER",
  "ARCHIVE_CHEERS_ATTACHED", "CHEER_REATTACHED", "AMAZING_PC_CHEER_ARCHIVED", "AMAZING_PC_TAKE", "COLLAB_RETURNED", "OPPONENT_CENTER_SWAPPED",
  "PERFORMANCE_START", "PERFORMANCE_SKIPPED", "PERFORMANCE_END", "ART", "DOWNED", "LIFE_DAMAGE",
  "LIFE_REVEALED", "CENTER_PROMOTED", "TURN_END", "GAME_OVER",
]);

function playbackCard(cardId, className = "") {
  const definition = card(cardId);
  if (!definition) return "";
  return `<img class="playback-card ${className}" src="${imagePath(definition)}" alt="${escapeHtml(definition.name)}">`;
}

function miniDeck(className = "") {
  return `<div class="playback-deck ${className}"><img class="mini-card" src="/assets/ui/BackB.png" alt=""><img class="mini-card" src="/assets/ui/BackB.png" alt=""><img class="mini-card" src="/assets/ui/BackB.png" alt=""></div>`;
}

function playbackEndpoint(cardId, label) {
  const definition = card(cardId);
  return `<span class="transfer-endpoint">${playbackCard(cardId)}<b>${escapeHtml(label || definition?.name || "CARD")}</b></span>`;
}

function battlefieldPoint(stageId) {
  const target = document.querySelector(`[data-battle-key="${CSS.escape(String(stageId))}"]`);
  const game = document.getElementById("game");
  if (!target || !game) return null;
  const gameRect = game.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const scale = gameRect.width / 480 || 1;
  return {
    element: target,
    x: (targetRect.left - gameRect.left + targetRect.width / 2) / scale,
    y: (targetRect.top - gameRect.top + targetRect.height / 2) / scale,
  };
}

function resetPlaybackStage() {
  ui.playbackStage.className = "playback-stage";
  ui.playbackVisual.removeAttribute("style");
  document.querySelectorAll(".playback-target-hit, .playback-attacker-pulse").forEach(element => {
    element.classList.remove("playback-target-hit", "playback-attacker-pulse");
  });
}

function renderPlaybackVisual(event, frame) {
  const data = event.data ?? {};
  const player = frame.state?.players?.[event.player ?? frame.playerId];
  resetPlaybackStage();
  ui.playbackVisual.className = "playback-visual";

  if (event.event === "DRAW") {
    const drawn = Math.max(0, Number(data.drawn ?? 0));
    const movingCards = Array.from({ length: drawn }, (_, index) => `<img class="mini-card draw-card" src="/assets/ui/BackB.png" alt="Card back" style="--draw-index:${index}">`).join("");
    ui.playbackVisual.innerHTML = `${miniDeck()}<div class="draw-sequence">${movingCards}</div><div class="playback-hand"><img class="mini-card" src="/assets/ui/BackB.png" alt=""><img class="mini-card" src="/assets/ui/BackB.png" alt=""><img class="mini-card" src="/assets/ui/BackB.png" alt=""><span class="hand-count">${player?.handCount ?? "?"}</span></div><span class="draw-count">+${drawn}</span>`;
    return;
  }
  if (event.event === "SHUFFLE" || event.event === "SUB_PC_BOTTOM") {
    ui.playbackVisual.innerHTML = `${miniDeck("shuffle")}<div class="playback-caption">${event.event === "SHUFFLE" ? "SHUFFLING DECK" : "CARDS TO BOTTOM"}</div>`;
    return;
  }
  if (event.event === "ART") {
    const color = String(data.attackerColor ?? card(data.attackerCardId)?.colors?.[0] ?? "Neutral").toLowerCase();
    const safeColor = ["white", "green", "red", "blue", "purple", "yellow", "neutral"].includes(color) ? color : "neutral";
    const particles = Array.from({ length: 8 }, (_, index) => `<i style="--particle:${index}"></i>`).join("");
    const attacker = battlefieldPoint(data.attackerStageId);
    const target = battlefieldPoint(data.targetStageId);
    if (attacker && target) {
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      ui.playbackStage.classList.add("battlefield-playback-stage");
      ui.playbackVisual.className = "playback-visual battlefield-attack-visual";
      ui.playbackVisual.style.setProperty("--attack-start-x", `${attacker.x}px`);
      ui.playbackVisual.style.setProperty("--attack-start-y", `${attacker.y}px`);
      ui.playbackVisual.style.setProperty("--attack-target-x", `${target.x}px`);
      ui.playbackVisual.style.setProperty("--attack-target-y", `${target.y}px`);
      ui.playbackVisual.style.setProperty("--attack-distance", `${Math.hypot(dx, dy)}px`);
      ui.playbackVisual.style.setProperty("--attack-angle", `${Math.atan2(dy, dx)}rad`);
      ui.playbackVisual.innerHTML = `<div class="attack-visual table-attack attack-${safeColor}"><span class="attack-projectile"></span><span class="attack-effect">${particles}</span><span class="hit-burst">✦</span></div>`;
      attacker.element.classList.add("playback-attacker-pulse");
      window.setTimeout(() => {
        ui.playbackVisual.querySelector(".attack-visual")?.classList.add("hit");
        target.element.classList.add("playback-target-hit");
      }, 360);
    } else {
      ui.playbackVisual.innerHTML = `<div class="attack-visual attack-${safeColor}">${playbackCard(data.attackerCardId)}<span class="playback-arrow">➜</span>${playbackCard(data.targetCardId)}<span class="attack-effect">${particles}</span><span class="hit-burst">✦</span></div>`;
      window.setTimeout(() => ui.playbackVisual.querySelector(".attack-visual")?.classList.add("hit"), 360);
    }
    return;
  }
  if (event.event === "ARCHIVE_CHEERS_ATTACHED") {
    const cheerIds = Array.isArray(data.cheerCardIds) ? data.cheerCardIds.slice(0, 5) : [];
    const cheers = cheerIds.length ? cheerIds.map((cardId, index) => `<span class="transfer-cheer" style="--transfer-index:${index}">${playbackCard(cardId, "cheer-card")}</span>`).join("") : `<span class="playback-caption">NO CHEER SELECTED</span>`;
    ui.playbackVisual.innerHTML = `<div class="cheer-transfer">${playbackEndpoint(data.sourceCardId, card(data.sourceCardId)?.name)}<div class="transfer-stream">${cheers}</div>${playbackEndpoint(data.targetCardId, card(data.targetCardId)?.name)}</div>`;
    return;
  }
  if (event.event === "CHEER_REATTACHED") {
    const cheer = `<span class="transfer-cheer" style="--transfer-index:0">${playbackCard(data.cardId, "cheer-card")}</span>`;
    ui.playbackVisual.innerHTML = `<div class="cheer-transfer">${playbackEndpoint(data.sourceCardId, data.sourceName)}<div class="transfer-stream">${cheer}</div>${playbackEndpoint(data.targetCardId, data.targetName)}</div>`;
    return;
  }
  if (event.event === "BLOOM" && data.previousCardId) {
    ui.playbackVisual.innerHTML = `${playbackCard(data.previousCardId)}<span class="playback-arrow">➜</span>${playbackCard(data.cardId)}`;
    return;
  }
  if (event.event === "BATON_PASS") {
    ui.playbackVisual.innerHTML = `${playbackCard(data.oldCenterCardId)}<span class="playback-arrow">⇄</span>${playbackCard(data.newCenterCardId)}`;
    return;
  }
  if (event.event === "OPPONENT_CENTER_SWAPPED") {
    ui.playbackVisual.innerHTML = `${playbackEndpoint(data.oldCenterCardId, data.oldCenterName)}<span class="playback-arrow">⇄</span>${playbackEndpoint(data.newCenterCardId, data.newCenterName)}`;
    return;
  }
  if (event.event === "DIE_ROLL" || event.event === "DIE_REPLACED") {
    ui.playbackVisual.classList.add("text-only");
    ui.playbackVisual.innerHTML = `<div class="playback-phase">DIE: ${escapeHtml(data.result ?? "?")}</div>`;
    return;
  }
  const directCardId = data.cardId ?? data.targetCardId;
  if (directCardId) {
    const definition = card(directCardId);
    const cheerClass = definition?.type === "Cheer" ? "cheer-card" : "";
    ui.playbackVisual.innerHTML = `${playbackCard(directCardId, cheerClass)}${data.targetCardId && data.targetCardId !== directCardId ? `<span class="playback-arrow">➜</span>${playbackCard(data.targetCardId)}` : ""}`;
    return;
  }
  ui.playbackVisual.classList.add("text-only");
  const label = event.event.replaceAll("_", " ");
  ui.playbackVisual.innerHTML = `<div class="playback-phase">${escapeHtml(label)}</div>`;
}

function interruptibleWait(milliseconds) {
  return new Promise(resolve => {
    let finished = false;
    const timer = window.setTimeout(finish, milliseconds);
    function finish() {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (advancePlayback === finish) advancePlayback = null;
      resolve();
    }
    advancePlayback = finish;
  });
}

function waitForPlaybackAdvance() {
  return new Promise(resolve => {
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (advancePlayback === finish) advancePlayback = null;
      resolve();
    }
    advancePlayback = finish;
  });
}

function playbackAnimationDuration(event) {
  if (event.event === "DRAW") return 620 + Math.max(0, Number(event.data?.drawn ?? 0) - 1) * 260;
  if (event.event === "ART" || event.event === "SHUFFLE" || event.event === "ARCHIVE_CHEERS_ATTACHED" || event.event === "CHEER_REATTACHED") return 850;
  return 320;
}

function typePlaybackText(message) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    ui.playbackText.textContent = message;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let index = 0;
    let finished = false;
    ui.playbackText.textContent = "";
    const timer = window.setInterval(() => {
      index++;
      ui.playbackText.textContent = message.slice(0, index);
      if (index >= message.length) finish();
    }, 12);
    function finish() {
      if (finished) return;
      finished = true;
      window.clearInterval(timer);
      ui.playbackText.textContent = message;
      if (advancePlayback === finish) advancePlayback = null;
      resolve();
    }
    advancePlayback = finish;
  });
}

async function showPlaybackEvent(event, frame) {
  ui.actionPlayback.classList.remove("hidden");
  ui.playbackSpeaker.textContent = event.player === "P2" ? "CPU ACTION" : event.player === "P1" ? "YOUR ACTION" : "BATTLE";
  ui.playbackHelp.textContent = "ANIMATION PLAYING…";
  const startedAt = Date.now();
  renderPlaybackVisual(event, frame);
  playPlaybackSfx(event);
  const description = event.data?.description;
  const message = description ? `${event.message}\nEFFECT: ${description}` : event.message;
  await typePlaybackText(message);
  const remainingAnimation = Math.max(120, playbackAnimationDuration(event) - (Date.now() - startedAt));
  await interruptibleWait(remainingAnimation);
  ui.playbackHelp.textContent = "▶ ENTER/CLICK: NEXT ACTION";
  await waitForPlaybackAdvance();
}

async function playResponse(nextModel, previousModel) {
  const frames = nextModel.playback ?? [];
  if (!frames.length) {
    model = nextModel;
    handleModel();
    return;
  }

  model = previousModel;
  dialogStack = [];
  for (const frame of frames) {
    for (let eventIndex = 0; eventIndex < frame.events.length; eventIndex++) {
      const event = frame.events[eventIndex];
      if (!PLAYBACK_EVENTS.has(event.event)) continue;
      const eventState = frame.eventStates?.[eventIndex] ?? frame.state;
      const eventFrame = { ...frame, state: eventState };
      model = { ...nextModel, state: eventState, legalActions: [], playback: [] };
      showScreen("PLAYBACK");
      renderBattle();
      await showPlaybackEvent(event, eventFrame);
    }
  }
  advancePlayback = null;
  ui.actionPlayback.classList.add("hidden");
  model = nextModel;
  handleModel();
}

async function flowPost(route, payload) {
  if (busy) return;
  busy = true;
  try {
    const request = api(route, payload);
    if (route === "/api/coin-flip") {
      document.querySelector(".coin")?.classList.add("flipping");
      await new Promise(resolve => window.setTimeout(resolve, 700));
    }
    const previousModel = model;
    const nextModel = await request;
    resetFlowSelection();
    await playResponse(nextModel, previousModel);
  } catch (error) { showToast(error.message); renderFlow(); }
  finally { busy = false; }
}

function renderFlow() {
  showScreen("FLOW");
  const step = model?.state?.pendingDecision ? `DECISION_${model.state.pendingDecision.step}` : model?.flow?.step;
  ui.flowStep.textContent = step?.replaceAll("_", " ") ?? "";
  ui.flowBody.replaceChildren();
  setFlowActions([]);
  ui.flowHelp.textContent = "↑ ↓ REVIEW · ENTER CONFIRM";

  if (step === "COIN_CALL") {
    ui.flowTitle.textContent = "COIN TOSS";
    ui.flowMessage.textContent = "Call the coin before it is flipped. The CPU takes the opposite side.";
    ui.flowBody.innerHTML = "<div class='coin-display'><div class='coin'>H</div><div>HEADS OR TAILS?</div></div>";
    setFlowActions([
      flowButton("HEADS", () => flowPost("/api/coin-flip", { call: "HEADS" }), true),
      flowButton("TAILS", () => flowPost("/api/coin-flip", { call: "TAILS" })),
    ]);
    ui.flowHelp.textContent = "CHOOSE A SIDE · ENTER/CLICK CONFIRM";
    return;
  }

  if (step === "ORDER_CHOICE") {
    ui.flowTitle.textContent = "YOU WON THE TOSS!";
    ui.flowMessage.textContent = `You called ${model.flow.playerCall}. The coin landed ${model.flow.coinResult}. Do you want to play first or second?`;
    ui.flowBody.innerHTML = `<div class='coin-display result'><div class='coin'>${model.flow.coinResult[0]}</div><div>YOU CONTROL THE TURN ORDER</div></div>`;
    setFlowActions([
      flowButton("GO FIRST", () => flowPost("/api/turn-order", { playerWantsFirst: true }), true),
      flowButton("GO SECOND", () => flowPost("/api/turn-order", { playerWantsFirst: false })),
    ]);
    ui.flowHelp.textContent = "CHOOSE FIRST OR SECOND · ENTER/CLICK CONFIRM";
    return;
  }

  if (step === "AI_ORDER") {
    ui.flowTitle.textContent = "CPU WON THE TOSS";
    ui.flowMessage.textContent = `You called ${model.flow.playerCall}. The coin landed ${model.flow.coinResult}.`;
    ui.flowBody.innerHTML = `<div class='coin-display result'><div class='coin'>${model.flow.coinResult[0]}</div><div>CPU CHOOSES TO GO ${model.flow.aiOrderChoice}</div></div>`;
    setFlowActions([flowButton("CONTINUE", () => flowPost("/api/turn-order", {}), true)]);
    ui.flowHelp.textContent = "PRESS ENTER TO PROCEED";
    return;
  }

  if (step === "REDRAW") {
    const debut = hasOpeningDebut();
    const redrawCount = model.state.players.P1.redrawCount;
    const freeRedrawAvailable = model.flow.optionalRedrawAvailable;
    ui.flowTitle.textContent = debut
      ? freeRedrawAvailable ? "OPENING HAND" : "OPENING HAND — FREE REDRAW USED"
      : redrawCount ? `MANDATORY REDRAW ${redrawCount + 1} OF 6` : "NO DEBUT — REDRAW REQUIRED";
    ui.flowStep.textContent = freeRedrawAvailable
      ? "FREE REDRAW AVAILABLE"
      : debut ? "DEBUT FOUND" : `MANDATORY ${redrawCount + 1}/6`;
    ui.flowMessage.textContent = debut
      ? redrawCount
        ? `A Debut was found after ${redrawCount} mandatory redraw(s). You will place ${redrawCount} card(s) on the bottom of your deck during setup.`
        : freeRedrawAvailable
          ? "Review all seven cards. You may keep this hand or use your one optional free redraw."
          : "Your one optional free redraw has been used. Because this hand contains a Debut Holomem, the rules require you to keep it; additional redraws only occur when a hand has no Debut."
      : freeRedrawAvailable
        ? "You cannot begin without a Debut. You may use the free optional redraw first, or begin mandatory redraws now."
        : `Mandatory redraw ${redrawCount + 1} of 6 is required. Each mandatory redraw adds one card to your setup penalty; failing the sixth loses the game.`;
    renderFlowCardList(handFlowItems());
    const actions = [];
    if (debut) actions.push(flowButton("KEEP HAND", () => flowPost("/api/setup/redraw", { kind: "keep" }), true));
    if (freeRedrawAvailable) actions.push(flowButton("FREE REDRAW", () => flowPost("/api/setup/redraw", { kind: "optional" }), !debut));
    if (!debut) actions.push(flowButton("MANDATORY REDRAW", () => flowPost("/api/setup/redraw", { kind: "mandatory" }), !model.flow.optionalRedrawAvailable));
    setFlowActions(actions);
    ui.flowHelp.textContent = debut && !freeRedrawAvailable ? "DEBUT FOUND · KEEP HAND TO CONTINUE" : "REVIEW YOUR HAND · CHOOSE KEEP OR REDRAW";
    return;
  }

  if (step === "CENTER") {
    const candidates = handFlowItems(instance => card(instance.cardId)?.type === "Holomem" && card(instance.cardId)?.bloomLevel === "Debut");
    ui.flowTitle.textContent = "CHOOSE YOUR CENTER";
    ui.flowMessage.textContent = "Select exactly one Debut holomem to begin in the Center position.";
    renderFlowCardList(candidates, false, false, true);
    setFlowActions([flowButton("SET AS CENTER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/setup/center", { cardUid: selected.uid });
    }, true)]);
    return;
  }

  if (step === "BACK") {
    const reserved = new Set([model.flow.centerUid]);
    const candidates = handFlowItems(instance => {
      const definition = card(instance.cardId);
      return !reserved.has(instance.uid) && definition.type === "Holomem" && ["Debut", "Spot"].includes(definition.bloomLevel);
    });
    const penalty = model.state.players.P1.redrawCount;
    const maximum = Math.min(5, candidates.length, model.state.players.P1.handCount - 1 - penalty);
    ui.flowTitle.textContent = "SET THE BACK STAGE";
    ui.flowMessage.textContent = `Choose zero to ${maximum} Debut or Spot holomem. ${penalty ? `${penalty} other card(s) must remain available for the redraw penalty.` : "You may finish with none."}`;
    renderFlowCardList(candidates, true);
    setFlowActions([
      flowButton(`CONFIRM BACK (${flowSelected.size}/${maximum})`, () => {
        if (flowSelected.size > maximum) return showToast(`Choose no more than ${maximum} Back Stage cards.`);
        flowPost("/api/setup/back", { cardUids: [...flowSelected] });
      }, true),
      flowButton("CLEAR", () => { flowSelected.clear(); renderFlow(); }),
    ]);
    ui.flowHelp.textContent = "↑ ↓ BROWSE · SPACE SELECT · ENTER CONFIRM";
    return;
  }

  if (step === "BOTTOM") {
    const excluded = new Set([model.flow.centerUid, ...model.flow.backUids]);
    const candidates = handFlowItems(instance => !excluded.has(instance.uid));
    const required = model.state.players.P1.redrawCount;
    ui.flowTitle.textContent = "REDRAW PENALTY";
    ui.flowMessage.textContent = `Choose exactly ${required} card(s) to place on the bottom of your deck. This does not change their relative order.`;
    renderFlowCardList(candidates, true);
    setFlowActions([
      flowButton(`CONFIRM (${flowSelected.size}/${required})`, () => {
        if (flowSelected.size !== required) return showToast(`Choose exactly ${required} card(s).`);
        flowPost("/api/setup/bottom", { cardUids: [...flowSelected] });
      }, true),
      flowButton("CLEAR", () => { flowSelected.clear(); renderFlow(); }),
    ]);
    ui.flowHelp.textContent = "↑ ↓ BROWSE · SPACE SELECT · ENTER CONFIRM";
    return;
  }

  if (step === "DECISION_SELECT_DEBUT") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleUids);
    const items = model.state.players.P1.resolution.filter(instance => eligible.has(instance.uid)).map(instance => {
      const definition = card(instance.cardId);
      return { uid: instance.uid, cardId: instance.cardId, name: definition.name, tag: `DEBUT · HP ${definition.hp}` };
    });
    ui.flowTitle.textContent = "NORMAL PC — CHOOSE A DEBUT";
    ui.flowMessage.textContent = "Review the Debut holomem found in your deck. Choose exactly one to reveal and place on your Back Stage.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("PLACE ON BACK", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedUid: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW · ENTER PLACE ON BACK STAGE";
    return;
  }

  if (step === "DECISION_SELECT_STAGE_CHEER") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleUids ?? []);
    const items = [];
    for (const stage of allStageCards().filter(item => item.owner === "P1")) {
      items.push({
        uid: `stage-${stage.holomem.stageId}`, cardId: stage.cardId, name: stage.name,
        tag: `${stage.zone} · ${stage.holomem.cheers.length} CHEER`, holomem: stage.holomem, zone: stage.zone,
        disabled: true, heading: true,
      });
      for (const cheer of stage.holomem.cheers) {
        const definition = card(cheer.cardId);
        items.push({
          uid: cheer.uid, cardId: cheer.cardId, name: definition.name,
          tag: `ATTACHED TO ${stage.name}`, indented: true, disabled: !eligible.has(cheer.uid),
        });
      }
    }
    ui.flowTitle.textContent = "AMAZING PC — ARCHIVE A CHEER";
    ui.flowMessage.textContent = "Review every Holomem on your Stage and Back Stage, then choose exactly one attached Cheer to archive as Amazing PC's cost.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("ARCHIVE CHEER", () => {
      const selected = currentFlowItem();
      if (!selected || !eligible.has(selected.uid)) return showToast("Choose one of the attached Cheers listed beneath a Holomem.");
      flowPost("/api/decision", { selectedUid: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW STAGE · ENTER ARCHIVE SELECTED CHEER";
    return;
  }

  if (step === "DECISION_SELECT_AMAZING_PC_HOLOMEM") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleUids ?? []);
    const items = model.state.players.P1.resolution.filter(instance => eligible.has(instance.uid)).map(instance => {
      const definition = card(instance.cardId);
      return { uid: instance.uid, cardId: instance.cardId, name: definition.name, tag: `${definition.bloomLevel} · HP ${definition.hp}` };
    });
    ui.flowTitle.textContent = "AMAZING PC — SEARCH YOUR DECK";
    ui.flowMessage.textContent = "Browse every eligible non-Buzz 1st and 2nd Holomem in your deck. Choose exactly one to reveal and add to your hand.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("ADD TO HAND", () => {
      const selected = currentFlowItem();
      if (selected && eligible.has(selected.uid)) flowPost("/api/decision", { selectedUid: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW · ENTER ADD SELECTED HOLOMEM TO HAND";
    return;
  }

  if (step === "DECISION_SELECT_LIMITED") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleUids);
    const items = model.state.players.P1.resolution.map(instance => ({
      uid: instance.uid, cardId: instance.cardId, name: card(instance.cardId).name,
      tag: eligible.has(instance.uid) ? "LIMITED" : "REVEALED", disabled: !eligible.has(instance.uid),
    }));
    ui.flowTitle.textContent = "SUB PC — TOP FIVE";
    ui.flowMessage.textContent = "Review the revealed cards. Select a LIMITED Support card if you want to add one to your hand.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([
      flowButton("ADD TO HAND", () => {
        const selected = currentFlowItem();
        if (!selected || !eligible.has(selected.uid)) return showToast("Choose a revealed LIMITED Support card.");
        flowPost("/api/decision", { selectedUid: selected.uid });
      }, true),
      flowButton("TAKE NO CARD", () => flowPost("/api/decision", { selectedUid: null })),
    ]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW · ENTER CONFIRM";
    return;
  }

  if (step === "DECISION_ORDER_BOTTOM") {
    const items = model.state.players.P1.resolution.map(instance => ({ uid: instance.uid, cardId: instance.cardId, name: card(instance.cardId).name, tag: "CHOOSE ORDER" }));
    ui.flowTitle.textContent = "SUB PC — ORDER THE BOTTOM";
    ui.flowMessage.textContent = "Choose every remaining card in order. The first selected card becomes the very bottom card.";
    renderFlowCardList(items, true, true);
    setFlowActions([
      flowButton(`CONFIRM ORDER (${bottomOrder.length}/${items.length})`, () => {
        if (bottomOrder.length !== items.length) return showToast("Choose every remaining card before confirming.");
        flowPost("/api/decision", { orderedUids: bottomOrder });
      }, true),
      flowButton("UNDO LAST", () => { bottomOrder.pop(); renderFlow(); }),
      flowButton("CLEAR", () => { bottomOrder = []; renderFlow(); }),
    ]);
    ui.flowHelp.textContent = "↑ ↓ BROWSE · SPACE ADD TO ORDER · ENTER CONFIRM";
    return;
  }

  if (step === "DECISION_SELECT_LIFE_CHEER_TARGET") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleStageIds ?? []);
    const items = allStageCards().filter(item => item.owner === "P1" && eligible.has(item.holomem.stageId)).map(item => ({
      uid: item.holomem.stageId, cardId: item.cardId, name: item.name, tag: item.zone, holomem: item.holomem, zone: item.zone,
    }));
    const cheer = card(decision.cardId);
    ui.flowTitle.textContent = "LIFE CHEER — CHOOSE A TARGET";
    ui.flowMessage.textContent = `${cheer?.name ?? "A Cheer"} was revealed from your Life. Choose which of your Holomem receives it.`;
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("ATTACH CHEER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedStageId: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW STATUS · ENTER ATTACH CHEER";
    return;
  }

  if (step === "DECISION_SELECT_NEW_CENTER") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleStageIds ?? []);
    const items = allStageCards().filter(item => item.owner === "P1" && eligible.has(item.holomem.stageId)).map(item => ({
      uid: item.holomem.stageId, cardId: item.cardId, name: item.name, tag: item.zone, holomem: item.holomem, zone: item.zone,
    }));
    ui.flowTitle.textContent = "RESET STEP — NEW CENTER";
    ui.flowMessage.textContent = "Your Center position is empty. Review your Back Stage and choose the Holomem that will become your new Center.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("MOVE TO CENTER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedStageId: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW STATUS · ENTER MOVE TO CENTER";
    return;
  }

  if (step === "DECISION_SELECT_EFFECT_CHEER_TARGET") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleStageIds ?? []);
    const items = allStageCards().filter(item => item.owner === "P1" && eligible.has(item.holomem.stageId)).map(item => ({
      uid: item.holomem.stageId, cardId: item.cardId, name: item.name, tag: item.zone, holomem: item.holomem, zone: item.zone,
    }));
    const cheer = card(decision.cardId);
    const effectName = decision.metadata?.effectName ?? "CARD EFFECT";
    ui.flowTitle.textContent = `${String(effectName).toUpperCase()} — CHEER TARGET`;
    ui.flowMessage.textContent = `${cheer?.name ?? "The top Cheer"} was revealed. Choose exactly which eligible Holomem receives it.`;
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("SEND CHEER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedStageId: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW STATUS · ENTER SEND CHEER";
    return;
  }

  if (step === "DECISION_SELECT_ARCHIVE_CHEER_TARGET") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleStageIds ?? []);
    const items = allStageCards().filter(item => item.owner === "P1" && eligible.has(item.holomem.stageId)).map(item => ({
      uid: item.holomem.stageId, cardId: item.cardId, name: item.name, tag: item.zone, holomem: item.holomem, zone: item.zone,
    }));
    ui.flowTitle.textContent = "A MIC IN MY RIGHT HAND";
    ui.flowMessage.textContent = "Choose the Green Holomem that will receive the archived Cheers.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("CHOOSE HOLOMEM", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedStageId: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW STATUS · ENTER CHOOSE TARGET";
    return;
  }

  if (step === "DECISION_SELECT_ARCHIVE_CHEERS") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleUids ?? []);
    const items = model.state.players.P1.archive.filter(instance => eligible.has(instance.uid)).map(instance => ({
      uid: instance.uid, cardId: instance.cardId, name: card(instance.cardId).name, tag: card(instance.cardId).provides ?? "CHEER",
    }));
    ui.flowTitle.textContent = "CHOOSE ARCHIVED CHEERS";
    ui.flowMessage.textContent = "Select any number of archived Cheers to send to the chosen Green Holomem. Selecting none is legal.";
    renderFlowCardList(items, true);
    setFlowActions([
      flowButton(`SEND SELECTED (${flowSelected.size})`, () => flowPost("/api/decision", { selectedUids: [...flowSelected] }), true),
      flowButton("SEND NONE", () => flowPost("/api/decision", { selectedUids: [] })),
      flowButton("CLEAR", () => { flowSelected.clear(); renderFlow(); }),
    ]);
    ui.flowHelp.textContent = "↑ ↓ BROWSE · SPACE SELECT · ENTER CONFIRM";
    return;
  }

  if (step === "DECISION_SELECT_REATTACH_CHEER") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleUids ?? []);
    const items = [];
    for (const stage of allStageCards().filter(item => item.owner === "P1")) {
      items.push({ uid: `stage-${stage.holomem.stageId}`, cardId: stage.cardId, name: stage.name, tag: `${stage.zone} · ${stage.holomem.cheers.length} CHEER`, holomem: stage.holomem, zone: stage.zone, disabled: true, heading: true });
      for (const cheer of stage.holomem.cheers) {
        const definition = card(cheer.cardId);
        items.push({ uid: cheer.uid, cardId: cheer.cardId, name: definition.name, tag: `ATTACHED TO ${stage.name}`, indented: true, disabled: !eligible.has(cheer.uid) });
      }
    }
    ui.flowTitle.textContent = "REPLACEMENT — CHOOSE A CHEER";
    ui.flowMessage.textContent = "Choose the exact attached Cheer you want to move. You will choose its destination next.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("CHOOSE CHEER", () => {
      const selected = currentFlowItem();
      if (!selected || !eligible.has(selected.uid)) return showToast("Choose one of the attached Cheers.");
      flowPost("/api/decision", { selectedUid: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW STAGE · ENTER CHOOSE CHEER";
    return;
  }

  if (step === "DECISION_SELECT_REATTACH_TARGET") {
    const eligible = new Set(model.state.pendingDecision.eligibleStageIds ?? []);
    const items = allStageCards().filter(item => item.owner === "P1" && eligible.has(item.holomem.stageId)).map(item => ({
      uid: item.holomem.stageId, cardId: item.cardId, name: item.name, tag: item.zone, holomem: item.holomem, zone: item.zone,
    }));
    ui.flowTitle.textContent = "REPLACEMENT — CHOOSE DESTINATION";
    ui.flowMessage.textContent = "Choose which of your Holomem receives the selected Cheer.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("REATTACH CHEER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedStageId: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW STATUS · ENTER REATTACH CHEER";
    return;
  }

  if (step === "DECISION_SELECT_OPPONENT_BACK") {
    const eligible = new Set(model.state.pendingDecision.eligibleStageIds ?? []);
    const items = allStageCards().filter(item => item.owner === "P2" && eligible.has(item.holomem.stageId)).map(item => ({
      uid: item.holomem.stageId, cardId: item.cardId, name: item.name, tag: item.zone, holomem: item.holomem, zone: item.zone,
    }));
    ui.flowTitle.textContent = "SO, THAT MAKES YOU MY ENEMY?";
    ui.flowMessage.textContent = "Choose the opponent's Back Stage Holomem that will swap with their Center.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("SWAP INTO CENTER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedStageId: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW OPPONENT · ENTER CONFIRM SWAP";
    return;
  }

  if (step === "DECISION_SELECT_HOLO_POWER_CARD") {
    const eligible = new Set(model.state.pendingDecision.eligibleUids ?? []);
    const items = (model.state.players.P1.holoPower ?? []).filter(instance => eligible.has(instance.uid)).map(instance => ({
      uid: instance.uid, cardId: instance.cardId, name: card(instance.cardId).name, tag: "HOLO POWER",
    }));
    ui.flowTitle.textContent = "HOPE — CHOOSE HOLO POWER";
    ui.flowMessage.textContent = "Look through your Holo Power and choose exactly one card to add to your hand.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("ADD TO HAND", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedUid: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW HOLO POWER · ENTER ADD TO HAND";
    return;
  }

  if (step === "DECISION_SELECT_HAND_FOR_HOLO_POWER") {
    const eligible = new Set(model.state.pendingDecision.eligibleUids ?? []);
    const items = handFlowItems(instance => eligible.has(instance.uid));
    ui.flowTitle.textContent = "HOPE — REFILL HOLO POWER";
    ui.flowMessage.textContent = "Choose exactly one card from your hand to place face-down as Holo Power.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("PLACE AS HOLO POWER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedUid: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW HAND · ENTER PLACE AS HOLO POWER";
    return;
  }

  if (step === "DECISION_SELECT_OPTIONAL_ARCHIVE_CHEER" || step === "DECISION_SELECT_ARCHIVE_CHEER") {
    const decision = model.state.pendingDecision;
    const eligible = new Set(decision.eligibleUids ?? []);
    const items = model.state.players.P1.archive.filter(instance => eligible.has(instance.uid)).map(instance => ({
      uid: instance.uid, cardId: instance.cardId, name: card(instance.cardId).name, tag: `${card(instance.cardId).provides ?? ""} CHEER`,
    }));
    const optional = step === "DECISION_SELECT_OPTIONAL_ARCHIVE_CHEER";
    ui.flowTitle.textContent = optional ? "DRAWING TOGETHER!" : "CIRCLE OF HOLOLIVE LISTENERS";
    ui.flowMessage.textContent = optional
      ? "You may choose one White or Green Cheer from your Archive to send to your Center, or skip this optional effect."
      : "Your die roll succeeded. Choose exactly which Cheer in your Archive you want to send to a Holomem.";
    renderFlowCardList(items, false, false, true);
    const actions = [flowButton("CHOOSE CHEER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedUid: selected.uid });
    }, true)];
    if (optional) actions.push(flowButton("SKIP EFFECT", () => flowPost("/api/decision", { selectedUid: null })));
    setFlowActions(actions);
    ui.flowHelp.textContent = "↑ ↓ REVIEW ARCHIVE · ENTER CONFIRM";
    return;
  }

  if (step === "DECISION_SELECT_ARCHIVE_CHEER_DESTINATION") {
    const eligible = new Set(model.state.pendingDecision.eligibleStageIds ?? []);
    const items = allStageCards().filter(item => item.owner === "P1" && eligible.has(item.holomem.stageId)).map(item => ({
      uid: item.holomem.stageId, cardId: item.cardId, name: item.name, tag: item.zone, holomem: item.holomem, zone: item.zone,
    }));
    ui.flowTitle.textContent = "CIRCLE OF HOLOLIVE LISTENERS";
    ui.flowMessage.textContent = "Choose which of your Holomem receives the selected archived Cheer.";
    renderFlowCardList(items, false, false, true);
    setFlowActions([flowButton("SEND CHEER", () => {
      const selected = currentFlowItem();
      if (selected) flowPost("/api/decision", { selectedStageId: selected.uid });
    }, true)]);
    ui.flowHelp.textContent = "↑ ↓ REVIEW STATUS · ENTER SEND CHEER";
    return;
  }

  if (step === "DECISION_SELECT_FIRST_GRAVITY_CARDS") {
    const eligible = new Set(model.state.pendingDecision.eligibleUids ?? []);
    const items = model.state.players.P1.resolution.map(instance => ({
      uid: instance.uid, cardId: instance.cardId, name: card(instance.cardId).name,
      tag: eligible.has(instance.uid) ? "ELIGIBLE HOLOMEM" : "REVEALED", disabled: !eligible.has(instance.uid),
    }));
    ui.flowTitle.textContent = "FIRST GRAVITY — TOP FOUR";
    ui.flowMessage.textContent = "Select any number of the revealed Tokino Sora and/or AZKi Holomem to add to your hand. Selecting none is legal.";
    renderFlowCardList(items, true, false, true);
    setFlowActions([
      flowButton(`ADD SELECTED (${flowSelected.size})`, () => flowPost("/api/decision", { selectedUids: [...flowSelected] }), true),
      flowButton("TAKE NONE", () => flowPost("/api/decision", { selectedUids: [] })),
      flowButton("CLEAR", () => { flowSelected.clear(); renderFlow(); }),
    ]);
    ui.flowHelp.textContent = "↑ ↓ BROWSE · SPACE SELECT · ENTER CONFIRM";
    return;
  }

  if (step === "DECISION_ORDER_FIRST_GRAVITY_BOTTOM") {
    const items = model.state.players.P1.resolution.map(instance => ({ uid: instance.uid, cardId: instance.cardId, name: card(instance.cardId).name, tag: "CHOOSE ORDER" }));
    ui.flowTitle.textContent = "FIRST GRAVITY — ORDER THE BOTTOM";
    ui.flowMessage.textContent = "Choose every remaining card in order. The first selected card becomes the very bottom card.";
    renderFlowCardList(items, true, true);
    setFlowActions([
      flowButton(`CONFIRM ORDER (${bottomOrder.length}/${items.length})`, () => {
        if (bottomOrder.length !== items.length) return showToast("Choose every remaining card before confirming.");
        flowPost("/api/decision", { orderedUids: bottomOrder });
      }, true),
      flowButton("UNDO LAST", () => { bottomOrder.pop(); renderFlow(); }),
      flowButton("CLEAR", () => { bottomOrder = []; renderFlow(); }),
    ]);
    ui.flowHelp.textContent = "↑ ↓ BROWSE · SPACE ADD TO ORDER · ENTER CONFIRM";
    return;
  }

  if (step === "DECISION_CHOOSE_OPTIONAL_ROLL") {
    const effectName = model.state.pendingDecision.metadata?.effectName ?? "THIS EFFECT";
    ui.flowTitle.textContent = String(effectName).toUpperCase();
    ui.flowMessage.textContent = `${effectName} says you may roll a die. Do you want to roll?`;
    ui.flowBody.innerHTML = "<div class='coin-display'><div class='coin'>?</div><div>OPTIONAL DIE ROLL</div></div>";
    setFlowActions([
      flowButton("ROLL DIE", () => flowPost("/api/decision", { choice: true }), true),
      flowButton("SKIP ROLL", () => flowPost("/api/decision", { choice: false })),
    ]);
    ui.flowHelp.textContent = "CHOOSE ROLL OR SKIP · ENTER/CLICK CONFIRM";
    return;
  }

  if (step === "DECISION_CHOOSE_DIE_METHOD") {
    const oshi = card(model.state.players.P1.oshiCardId);
    const ability = oshi?.abilities?.find(candidate => candidate.id === "replace_next_die_result");
    ui.flowTitle.textContent = "A MAP IN MY LEFT HAND";
    ui.flowMessage.textContent = "You have enough Holo Power to replace this die roll. Use the Oshi Skill, or roll normally?";
    ui.flowBody.innerHTML = `<div class="flow-skill-confirm"><img src="${imagePath(oshi)}" alt="${escapeHtml(oshi?.name ?? "Oshi")}"><div><strong>${escapeHtml(ability?.name ?? "A Map in My Left Hand")}</strong><span>HOLO POWER COST ${ability?.holoPowerCost ?? 3} · ${escapeHtml(ability?.usage ?? "1/TURN")}</span><p>${escapeHtml(ability?.printedText ?? "Declare one face number; the next die result is treated as that result.")}</p></div><div class="coin">?</div></div>`;
    setFlowActions([
      flowButton("USE OSHI SKILL", () => flowPost("/api/decision", { choice: true }), true),
      flowButton("ROLL NORMALLY", () => flowPost("/api/decision", { choice: false })),
    ]);
    ui.flowHelp.textContent = "CHOOSE METHOD · ENTER/CLICK CONFIRM";
    return;
  }

  if (step === "DECISION_DECLARE_DIE_FACE") {
    ui.flowTitle.textContent = "DECLARE A DIE RESULT";
    ui.flowMessage.textContent = "Choose the result that A Map in My Left Hand will assign to this die roll.";
    ui.flowBody.innerHTML = "<div class='coin-display'><div class='coin'>★</div><div>CHOOSE 1–6</div></div>";
    const actions = Array.from({ length: 6 }, (_, index) => {
      const button = flowButton(String(index + 1), () => flowPost("/api/decision", { number: index + 1 }), index === 0);
      button.classList.add("die-face-button");
      return button;
    });
    setFlowActions(actions);
    ui.flowHelp.textContent = "← → CHOOSE RESULT · ENTER/CLICK CONFIRM";
    return;
  }

  if (step === "DECISION_CHOOSE_EXPANDING_MAP_RETURN") {
    ui.flowTitle.textContent = "EXPANDING MAP";
    ui.flowMessage.textContent = "The die result was 1. Do you want to move this AZKi from Collab back to the Back Stage?";
    ui.flowBody.innerHTML = "<div class='coin-display'><div class='coin'>1</div><div>OPTIONAL RETURN</div></div>";
    setFlowActions([
      flowButton("MOVE TO BACK", () => flowPost("/api/decision", { choice: true }), true),
      flowButton("STAY IN COLLAB", () => flowPost("/api/decision", { choice: false })),
    ]);
    ui.flowHelp.textContent = "CHOOSE POSITION · ENTER/CLICK CONFIRM";
    return;
  }
}

const TABLE_TARGET_COPY = {
  SELECT_LIFE_CHEER_TARGET: {
    title: "LIFE CHEER",
    message: decision => `${card(decision.cardId)?.name ?? "A Cheer"} was revealed from Life. Choose the Holomem that receives it.`,
  },
  SELECT_NEW_CENTER: {
    title: "NEW CENTER",
    message: () => "Your Center is empty. Choose the Back Stage Holomem that moves into Center.",
  },
  SELECT_EFFECT_CHEER_TARGET: {
    title: "CHEER TARGET",
    message: decision => `${card(decision.cardId)?.name ?? "The top Cheer"} is waiting. Choose its recipient for ${decision.metadata?.effectName ?? "this effect"}.`,
  },
  SELECT_ARCHIVE_CHEER_TARGET: {
    title: "A MIC IN MY RIGHT HAND",
    message: () => "Choose the Green Holomem that will receive the archived Cheers.",
  },
  SELECT_REATTACH_TARGET: {
    title: "REPLACEMENT",
    message: () => "Choose the Holomem that receives the selected Cheer.",
  },
  SELECT_OPPONENT_BACK: {
    title: "OSHI SKILL TARGET",
    message: () => "Choose the opponent's Back Stage Holomem that swaps into Center.",
  },
  SELECT_ARCHIVE_CHEER_DESTINATION: {
    title: "CHEER DESTINATION",
    message: () => "Choose the Holomem that receives the selected archived Cheer.",
  },
};

function pendingTableTargetMode(decision) {
  const copy = decision && TABLE_TARGET_COPY[decision.step];
  if (!copy) return null;
  return {
    kind: "DECISION",
    step: decision.step,
    title: copy.title,
    message: copy.message(decision),
    eligibleStageIds: [...(decision.eligibleStageIds ?? [])],
  };
}

function tableTargetCandidates() {
  if (!tableTargetMode) return [];
  const actions = tableTargetMode.kind === "ACTION" ? tableTargetMode.actions : null;
  const eligible = new Set(actions ? actions.map(action => action.targetStageId) : tableTargetMode.eligibleStageIds);
  return allStageCards().filter(item => eligible.has(item.holomem.stageId)).map(item => ({
    ...item,
    key: item.holomem.stageId,
    row: item.zone.includes("BACK") ? `${item.owner}_BACK` : item.owner,
    action: actions?.find(action => action.targetStageId === item.holomem.stageId),
  }));
}

function beginTableTarget(mode) {
  tableTargetMode = mode;
  const first = tableTargetCandidates()[0];
  if (!first) {
    tableTargetMode = null;
    return showToast("No legal target remains on the table.");
  }
  battleFocus = first.row;
  stageFocusIndex[first.row] = 0;
  showScreen("BATTLE");
  renderBattle();
}

function isTableTarget(stageId) {
  return Boolean(tableTargetMode && tableTargetCandidates().some(candidate => candidate.key === stageId));
}

function focusableBattleCards(row) {
  if (!tableTargetMode) return visibleBattleCards(row);
  const eligible = new Set(tableTargetCandidates().filter(candidate => candidate.row === row).map(candidate => candidate.key));
  return visibleBattleCards(row).filter(item => eligible.has(item.key));
}

function cancelTableTarget() {
  if (!tableTargetMode) return;
  if (tableTargetMode.kind === "DECISION") {
    showToast("This effect must finish. Choose one of the highlighted cards.");
    return;
  }
  tableTargetMode = null;
  showScreen("DIALOG");
  renderDialog();
}

async function submitTableDecision(selectedStageId) {
  if (busy || !tableTargetMode) return;
  const fallback = tableTargetMode;
  tableTargetMode = null;
  busy = true;
  try {
    const previousModel = model;
    const nextModel = await api("/api/decision", { selectedStageId });
    resetFlowSelection();
    await playResponse(nextModel, previousModel);
  } catch (error) {
    tableTargetMode = fallback;
    showToast(error.message);
    showScreen("BATTLE");
    renderBattle();
  } finally { busy = false; }
}

function confirmTableTarget(item) {
  const candidate = tableTargetCandidates().find(target => target.key === item.key);
  if (!candidate) return showToast("Choose one of the highlighted cards.");
  if (tableTargetMode.kind === "DECISION") return submitTableDecision(candidate.key);
  const fallback = tableTargetMode;
  tableTargetMode = null;
  return submitAction(candidate.action, fallback);
}

function summary(player, opponent = false) {
  const stageCount = Number(Boolean(player.stage.center)) + Number(Boolean(player.stage.collab)) + player.stage.back.filter(Boolean).length;
  return `<div class="summary-oshi">${opponent ? "CPU STATUS" : "PLAYER STATUS"}</div>
    <div class="summary-row"><span>HAND</span><span>${player.handCount}</span></div><div class="summary-row"><span>MAIN DECK</span><span>${player.deckCount}</span></div>
    <div class="summary-row"><span>CHEER DECK</span><span>${player.cheerDeckCount}</span></div><div class="summary-row"><span>ARCHIVE</span><span>${player.archiveCount}</span></div>
    <div class="summary-row"><span>STAGE</span><span>${stageCount}/6</span></div>`;
}

function cheerIcons(holomem) {
  if (!holomem.cheers.length) return "<div class='cheer-icons empty-cheers'>—</div>";
  return `<div class="cheer-icons">${holomem.cheers.map(instance => {
    const color = card(instance.cardId)?.provides ?? "Neutral";
    return `<img class="cheer-icon" src="${cheerIconPath(color)}" title="${color} Cheer" alt="${color}">`;
  }).join("")}</div>`;
}

function stackUnderlayHtml(holomem, className = "stacked-card-underlay") {
  const underCards = holomem.stack.slice(0, -1);
  return underCards.map((instance, index) => {
    const definition = card(instance.cardId);
    const depth = underCards.length - index;
    return `<img class="${className}" style="--stack-depth:${depth}" src="${imagePath(definition)}" alt="" aria-hidden="true">`;
  }).join("");
}

function stageToken(holomem, position, owner) {
  const wrapper = document.createElement("div");
  wrapper.className = "stage-card-wrap large";
  if (!holomem) {
    const empty = document.createElement("div");
    empty.className = "empty-slot large-slot";
    wrapper.append(empty);
    return wrapper;
  }
  const definition = topCard(holomem);
  const related = !tableTargetMode && (model.legalActions ?? []).some(action => action.targetStageId === holomem.stageId || action.attackerStageId === holomem.stageId);
  const token = document.createElement("button");
  token.className = `card-token ${position.toLowerCase()}-token${holomem.resting ? " resting" : ""}${owner === "P1" && related ? " legal" : ""}`;
  token.dataset.battleOwner = owner;
  token.dataset.battleRow = owner;
  token.dataset.battleKey = holomem.stageId;
  token.title = `${definition.name} · ${holomem.stack.length} card pile · ${holomem.cheers.length} Cheer`;
  token.style.marginBottom = `${Math.min(5, Math.max(0, holomem.stack.length - 1) * 2)}px`;
  token.innerHTML = `${stackUnderlayHtml(holomem)}<img class="top-card-art" src="${imagePath(definition)}" alt="${escapeHtml(definition.name)}">${holomem.damage ? `<span class="card-stats">${holomem.damage}</span>` : ""}`;
  token.addEventListener("mouseenter", () => focusVisibleCard(owner, holomem.stageId));
  token.addEventListener("click", () => activateBattleCard(owner, owner, holomem.stageId));
  wrapper.innerHTML = cheerIcons(holomem);
  wrapper.prepend(token);
  return wrapper;
}

function waitingCheerCardId(player, owner) {
  if (player.pendingCheer?.cardId) return player.pendingCheer.cardId;
  const decision = model?.state?.pendingDecision;
  if (decision?.playerId !== owner) return null;
  if (["SELECT_LIFE_CHEER_TARGET", "SELECT_EFFECT_CHEER_TARGET"].includes(decision.step)) return decision.cardId ?? null;
  if (decision.step === "SELECT_REATTACH_TARGET") {
    const selectedUid = decision.metadata?.cheerUid;
    return allStageCards().filter(item => item.owner === owner).flatMap(item => item.holomem.cheers).find(cheer => cheer.uid === selectedUid)?.cardId ?? null;
  }
  if (decision.step === "SELECT_ARCHIVE_CHEER_DESTINATION") {
    return player.archive.find(cheer => cheer.uid === decision.metadata?.cheerUid)?.cardId ?? null;
  }
  return null;
}

function waitingCheerToken(cardId) {
  const definition = card(cardId);
  const wrapper = document.createElement("div");
  wrapper.className = "pending-cheer-wrap";
  wrapper.setAttribute("aria-label", `${definition?.name ?? "Cheer"} waiting to be attached`);
  const color = definition?.provides ?? "Neutral";
  wrapper.innerHTML = `<div class="pending-cheer-card"><img class="pending-cheer-art" src="${imagePath(definition)}" alt="${escapeHtml(definition?.name ?? "Pending Cheer")}"><img class="pending-cheer-color" src="${cheerIconPath(color)}" title="${escapeHtml(color)} Cheer" alt="${escapeHtml(color)}"></div><span>WAITING</span>`;
  return wrapper;
}

function oshiToken(player, owner) {
  const wrapper = document.createElement("div");
  wrapper.className = "oshi-card-wrap";
  const definition = card(player.oshiCardId);
  const life = document.createElement("div");
  life.className = "oshi-life";
  life.innerHTML = `<span>LIFE</span><span class="life-pips">${"◆".repeat(player.lifeCount)}${"◇".repeat(Math.max(0, (definition?.life ?? 0) - player.lifeCount))}</span>`;
  const token = document.createElement("button");
  token.className = "card-token oshi-field-token";
  token.dataset.battleOwner = owner;
  token.dataset.battleRow = owner;
  token.dataset.battleKey = "OSHI";
  token.title = `${definition?.name ?? "Oshi"} · ${player.holoPowerCount} Holo Power`;
  token.innerHTML = `<img src="${imagePath(definition)}" alt="${escapeHtml(definition?.name ?? "Oshi")}"><span class="oshi-power-count">POWER ${player.holoPowerCount}</span>`;
  token.addEventListener("mouseenter", () => focusVisibleCard(owner, "OSHI"));
  token.addEventListener("click", () => activateBattleCard(owner, owner, "OSHI"));
  wrapper.append(life, token);
  return wrapper;
}

function zoneGroup(title, content, className = "") {
  const group = document.createElement("div");
  group.className = `zone-group ${className}`;
  const label = document.createElement("div");
  label.className = "zone-title";
  label.textContent = title;
  group.append(label, content);
  return group;
}

function renderField(container, player, owner) {
  const board = document.createElement("div");
  board.className = `field-board ${owner === "P1" ? "player-board" : "opponent-board"}`;
  const groups = [
    zoneGroup("OSHI", oshiToken(player, owner), "oshi-group"),
    zoneGroup("COLLAB", stageToken(player.stage.collab, "COLLAB", owner), "collab-group"),
    zoneGroup("CENTER", stageToken(player.stage.center, "CENTER", owner), "center-group"),
  ];
  const waitingCheer = waitingCheerCardId(player, owner);
  if (waitingCheer) groups.push(zoneGroup("CHEER", waitingCheerToken(waitingCheer), "pending-cheer-group"));
  board.append(...groups);
  container.replaceChildren(board);
}

function renderBackstagePeeks(player, container, owner) {
  const row = `${owner}_BACK`;
  container.replaceChildren(...player.stage.back.filter(Boolean).map(holomem => {
    const definition = topCard(holomem);
    const peek = document.createElement("button");
    peek.className = `backstage-peek-card${holomem.resting ? " resting" : ""}`;
    peek.dataset.battleOwner = owner;
    peek.dataset.battleRow = row;
    peek.dataset.battleKey = holomem.stageId;
    peek.title = `${definition.name} · ${definition.bloomLevel ?? "Holomem"} · ${holomem.stack.length} card pile · ${holomem.cheers.length} Cheer`;
    const pips = holomem.cheers.map(instance => {
      const color = card(instance.cardId)?.provides ?? "Neutral";
      return `<span class="backstage-cheer-pip cheer-pip-${color.toLowerCase()}" title="${escapeHtml(color)} Cheer"></span>`;
    }).join("");
    peek.innerHTML = `<span class="backstage-card-pile">${stackUnderlayHtml(holomem, "backstage-stack-underlay")}<img class="backstage-top-art" src="${imagePath(definition)}" alt="${escapeHtml(definition.name)}"></span><span class="backstage-cheer-pips" aria-label="${holomem.cheers.length} attached Cheer">${pips}</span>`;
    peek.addEventListener("mouseenter", () => focusVisibleCard(row, holomem.stageId));
    peek.addEventListener("click", () => activateBattleCard(owner, row, holomem.stageId));
    return peek;
  }));
}

function nextStepAction() {
  return (model?.legalActions ?? []).find(action => action.type === "END_MAIN" || action.type === "END_PERFORMANCE");
}

function nextStepLabel() {
  const action = nextStepAction();
  if (action?.type === "END_MAIN") return "PERFORMANCE STEP";
  if (action?.type === "END_PERFORMANCE") return "END STEP";
  return "NEXT STEP";
}

function availableCommands() {
  return { HAND: true, BACKSTAGE: true, ARCHIVE: true, LOG: true, STEP: Boolean(nextStepAction()) };
}

function renderCommands() {
  const enabled = availableCommands();
  const recommended = model.state.phase === "PERFORMANCE" ? "STEP" : null;
  ui.commandMenu.replaceChildren(...COMMANDS.map((name, index) => {
    const button = document.createElement("button");
    button.dataset.command = name;
    button.className = `command${!tableTargetMode && battleFocus === "COMMAND" && index === commandIndex ? " selected" : ""}${enabled[name] && !tableTargetMode ? "" : " disabled"}${recommended === name ? " recommended" : ""}`;
    button.textContent = name === "STEP" ? nextStepLabel() : name;
    button.addEventListener("mouseenter", () => {
      if (tableTargetMode) return;
      battleFocus = "COMMAND"; commandIndex = index; renderBattleFocus();
    });
    button.addEventListener("click", () => {
      if (tableTargetMode) return showToast("Choose one of the highlighted cards.");
      battleFocus = "COMMAND"; commandIndex = index; selectCommand(name);
    });
    return button;
  }));
}

function visibleBattleCards(row) {
  const owner = row.startsWith("P2") ? "P2" : "P1";
  const player = model.state.players[owner];
  if (row.endsWith("_BACK")) {
    return player.stage.back.map((holomem, index) => holomem ? {
      kind: "FIELD", key: holomem.stageId, owner, holomem, zone: `BACK ${index + 1}`,
    } : null).filter(Boolean);
  }
  const items = {
    OSHI: { kind: "OSHI", key: "OSHI", owner, zone: "OSHI" },
    CENTER: player.stage.center ? { kind: "FIELD", key: player.stage.center.stageId, owner, holomem: player.stage.center, zone: "CENTER" } : null,
    COLLAB: player.stage.collab ? { kind: "FIELD", key: player.stage.collab.stageId, owner, holomem: player.stage.collab, zone: "COLLAB" } : null,
  };
  const order = owner === "P1" ? ["OSHI", "COLLAB", "CENTER"] : ["CENTER", "COLLAB", "OSHI"];
  return order.map(position => items[position]).filter(Boolean);
}

function renderBattleFocus() {
  document.querySelectorAll(".card-token.focused, .backstage-peek-card.focused, .card-token.targetable, .backstage-peek-card.targetable").forEach(token => token.classList.remove("focused", "targetable"));
  if (tableTargetMode) {
    for (const target of tableTargetCandidates()) {
      document.querySelector(`[data-battle-row="${target.row}"][data-battle-key="${target.key}"]`)?.classList.add("targetable");
    }
  }
  if (battleFocus === "COMMAND") {
    [...ui.commandMenu.children].forEach((button, index) => button.classList.toggle("selected", index === commandIndex));
    ui.eventMessage.textContent = defaultBattleMessage();
    return;
  }
  [...ui.commandMenu.children].forEach(button => button.classList.remove("selected"));
  const items = focusableBattleCards(battleFocus);
  if (!items.length) return;
  stageFocusIndex[battleFocus] = Math.min(stageFocusIndex[battleFocus] ?? 0, items.length - 1);
  const item = items[stageFocusIndex[battleFocus]];
  document.querySelector(`[data-battle-row="${battleFocus}"][data-battle-key="${item.key}"]`)?.classList.add("focused");
  const definition = item.kind === "OSHI" ? card(model.state.players[item.owner].oshiCardId) : topCard(item.holomem);
  const area = battleFocus.endsWith("_BACK") ? "BACKSTAGE" : "STAGE";
  ui.eventMessage.textContent = tableTargetMode
    ? `${tableTargetMode.title} · ${definition?.name ?? "CARD"} · ENTER/CLICK CONFIRM${tableTargetMode.kind === "ACTION" ? " · ESC BACK" : ""}`
    : `${item.owner === "P1" ? "YOUR" : "OPPONENT"} ${area} · ${definition?.name ?? "CARD"} · ← → SELECT · ENTER ACTIONS`;
}

function focusVisibleCard(row, key) {
  if (tableTargetMode && !tableTargetCandidates().some(item => item.row === row && item.key === key)) return;
  battleFocus = row;
  const index = focusableBattleCards(row).findIndex(item => item.key === key);
  stageFocusIndex[row] = Math.max(0, index);
  renderBattleFocus();
}

function activateBattleCard(owner, row, key) {
  if (tableTargetMode) {
    const item = tableTargetCandidates().find(candidate => candidate.row === row && candidate.key === key);
    return item ? confirmTableTarget(item) : showToast("Choose one of the highlighted cards.");
  }
  openBattleCardActions(owner, key);
}

function moveBattleRow(delta) {
  const rows = BATTLE_ROWS.filter(row => tableTargetMode ? row !== "COMMAND" && focusableBattleCards(row).length : row === "COMMAND" || visibleBattleCards(row).length);
  const current = Math.max(0, rows.indexOf(battleFocus));
  battleFocus = rows[Math.max(0, Math.min(rows.length - 1, current + delta))];
  stageFocusIndex[battleFocus] = Math.min(stageFocusIndex[battleFocus] ?? 0, Math.max(0, focusableBattleCards(battleFocus).length - 1));
}

function moveVisibleFocus(delta) {
  const items = focusableBattleCards(battleFocus);
  if (!items.length) return;
  stageFocusIndex[battleFocus] = (stageFocusIndex[battleFocus] + items.length + delta) % items.length;
  renderBattleFocus();
}

function activateVisibleFocus() {
  const item = focusableBattleCards(battleFocus)[stageFocusIndex[battleFocus]];
  if (!item) return;
  if (tableTargetMode) confirmTableTarget(item);
  else openBattleCardActions(item.owner, item.key);
}

function defaultBattleMessage() {
  if (tableTargetMode) return tableTargetMode.message;
  const { state } = model;
  const last = state.log.at(-1);
  return state.phase === "CHEER" && state.players.P1.pendingCheer
    ? `Cheer Step: send ${card(state.players.P1.pendingCheer.cardId)?.name ?? "Cheer"} to a Holomem.`
    : last?.message ?? "Choose a command. Press Up to browse the Backstage and Stage.";
}

function renderBattle() {
  if (!model?.state || model.state.phase === "SETUP") return;
  const { state } = model;
  ui.battle.classList.toggle("targeting", Boolean(tableTargetMode));
  ui.turnLabel.textContent = `TURN ${state.turnNumber}`;
  ui.phaseLabel.textContent = state.phase;
  ui.activeLabel.textContent = state.activePlayer === "P1" ? "YOUR TURN" : "CPU TURN";
  ui.opponentSummary.innerHTML = summary(state.players.P2, true);
  ui.playerSummary.innerHTML = summary(state.players.P1, false);
  renderField(ui.opponentField, state.players.P2, "P2");
  renderField(ui.playerField, state.players.P1, "P1");
  renderBackstagePeeks(state.players.P2, ui.opponentBackstagePeek, "P2");
  renderBackstagePeeks(state.players.P1, ui.playerBackstagePeek, "P1");
  ui.eventMessage.textContent = defaultBattleMessage();
  renderCommands();
  renderBattleFocus();
}

function allStageCards() {
  const collect = (player, owner) => [["CENTER", player.stage.center], ["COLLAB", player.stage.collab], ...player.stage.back.map((h, i) => [`BACK ${i + 1}`, h])]
    .filter(([, h]) => h).map(([zone, holomem]) => ({ owner, zone: owner === "P2" ? `CPU ${zone}` : zone, holomem, cardId: topCard(holomem).id, name: topCard(holomem).name }));
  return [...collect(model.state.players.P1, "P1"), ...collect(model.state.players.P2, "P2")];
}

function relatedActions(item) {
  const actions = model.legalActions ?? [];
  if (item.kind === "HAND") return actions.filter(action => action.cardUid === item.uid);
  if (item.kind === "OSHI" && item.owner === "P1") return actions.filter(action => action.type === "USE_OSHI_SKILL");
  if (item.kind === "FIELD" && item.owner === "P1") return actions.filter(action => {
    if (action.type === "USE_ART") return action.attackerStageId === item.holomem.stageId;
    if (action.type === "BATON_PASS") return model.state.players.P1.stage.center?.stageId === item.holomem.stageId;
    if (action.type === "COLLAB" || action.type === "ATTACH_CHEER") return action.targetStageId === item.holomem.stageId;
    return false;
  });
  return [];
}

function actionKey(action) {
  if (action.type === "USE_ART") return `${action.type}:${action.artIndex}`;
  if (action.type === "USE_OSHI_SKILL") return `${action.type}:${action.abilityIndex}`;
  return action.type;
}

function actionName(action, sourceItem) {
  if (action.type === "PLACE_HOLOMEM") return "PLACE ON BACK STAGE";
  if (action.type === "BLOOM") return "BLOOM";
  if (action.type === "PLAY_SUPPORT") return "PLAY SUPPORT";
  if (action.type === "ATTACH_CHEER") return "ATTACH REVEALED CHEER";
  if (action.type === "COLLAB") return "MOVE TO COLLAB";
  if (action.type === "BATON_PASS") return "BATON PASS";
  if (action.type === "USE_OSHI_SKILL") return card(model.state.players.P1.oshiCardId).abilities[action.abilityIndex].name;
  if (action.type === "USE_ART") return topCard(sourceItem.holomem).arts[action.artIndex].name;
  return action.type;
}

function targetName(action) {
  const target = allStageCards().find(item => item.holomem.stageId === action.targetStageId);
  return target ? `${target.name} · ${target.zone}` : "TARGET";
}

function fieldItems(owner) {
  return allStageCards().filter(item => item.owner === owner).map(item => ({
    kind: "FIELD", ...item, tag: item.zone, cheerColors: item.holomem.cheers.map(instance => card(instance.cardId)?.provides ?? "Neutral"),
  }));
}

function backstageItems(owner) {
  return fieldItems(owner).filter(item => item.zone.includes("BACK"));
}

function visibleStageItems(owner) {
  return fieldItems(owner).filter(item => !item.zone.includes("BACK"));
}

function switchBackstageView(owner) {
  dialogStack = [{ title: "BACKSTAGE", items: backstageItems(owner), index: 0, level: "CARDS", fieldOwner: owner }];
  renderDialog();
}

function openVisibleStage(owner, selectedStageId) {
  openBattleCardActions(owner, selectedStageId);
}

function openBattleCardActions(owner, cardKey) {
  const item = cardKey === "OSHI"
    ? oshiItems(owner)[0]
    : fieldItems(owner).find(candidate => candidate.holomem.stageId === cardKey);
  if (!item) return;
  dialogStack = [];
  showScreen("DIALOG");
  openCardActions(item);
}

function oshiItems(owner) {
  const player = model.state.players[owner];
  const definition = card(player.oshiCardId);
  return [{ kind: "OSHI", owner, cardId: definition.id, name: definition.name, tag: `POWER ${player.holoPowerCount}` }];
}

function switchOshiView(owner) {
  dialogStack = [{ title: "OSHI", items: oshiItems(owner), index: 0, level: "CARDS", fieldOwner: owner }];
  renderDialog();
}

function openZone(command, selectedStageId = null, fieldOwner = "P1") {
  let items = [];
  if (command === "HAND") {
    items = model.state.players.P1.hand.map(instance => {
      const definition = card(instance.cardId);
      return { kind: "HAND", uid: instance.uid, cardId: instance.cardId, name: definition.name, tag: definition.bloomLevel ?? definition.supportType ?? definition.type, cheerColors: definition.type === "Holomem" ? [] : undefined };
    });
    items = applyHandDisplayOrder(items);
  }
  if (command === "BACKSTAGE") items = backstageItems(fieldOwner);
  if (command === "OSHI") items = oshiItems(fieldOwner);
  if (command === "ARCHIVE") items = model.state.players.P1.archive.map(instance => ({ kind: "ARCHIVE", uid: instance.uid, cardId: instance.cardId, name: card(instance.cardId).name, tag: card(instance.cardId).type }));
  if (command === "LOG") items = [...model.state.log].reverse().map(entry => ({ kind: "LOG", name: entry.message, tag: `T${entry.turn}`, text: `${entry.phase} · ${entry.event}` }));
  const selectedIndex = selectedStageId ? items.findIndex(item => item.holomem?.stageId === selectedStageId) : 0;
  dialogStack = [{ title: command, items, index: Math.max(0, selectedIndex), level: "CARDS", fieldOwner: ["BACKSTAGE", "OSHI"].includes(command) ? fieldOwner : undefined }];
  showScreen("DIALOG");
  renderDialog();
}

function sortHandItems(items) {
  const levelOrder = { Debut: 0, Spot: 0, "1st": 1, "2nd": 2, "3rd": 3 };
  const typeOrder = definition => definition?.type === "Holomem" ? 0 : definition?.type === "Support" ? 1 : 2;
  return [...items].sort((left, right) => {
    const leftCard = card(left.cardId);
    const rightCard = card(right.cardId);
    return typeOrder(leftCard) - typeOrder(rightCard)
      || String(leftCard?.name ?? "").localeCompare(String(rightCard?.name ?? ""))
      || (levelOrder[leftCard?.bloomLevel] ?? 9) - (levelOrder[rightCard?.bloomLevel] ?? 9)
      || String(leftCard?.id ?? "").localeCompare(String(rightCard?.id ?? ""));
  });
}

function applyHandDisplayOrder(items) {
  if (!handDisplayOrder) return items;
  const byUid = new Map(items.map(item => [item.uid, item]));
  const surviving = handDisplayOrder.filter(uid => byUid.has(uid));
  const known = new Set(surviving);
  const newcomers = items.filter(item => !known.has(item.uid));
  if (newcomers.length) handDisplaySorted = false;
  handDisplayOrder = [...surviving, ...newcomers.map(item => item.uid)];
  return handDisplayOrder.map(uid => byUid.get(uid)).filter(Boolean);
}

function sortCurrentHand() {
  const view = dialogStack.at(-1);
  if (view?.level !== "CARDS" || view.title !== "HAND") return;
  const selectedUid = view.items[view.index]?.uid;
  view.items = sortHandItems(view.items);
  handDisplayOrder = view.items.map(item => item.uid);
  handDisplaySorted = true;
  view.index = Math.max(0, view.items.findIndex(item => item.uid === selectedUid));
  renderDialog();
}

function openCardActions(item) {
  const actions = relatedActions(item);
  const groups = new Map();
  for (const action of actions) {
    const key = actionKey(action);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  }
  const items = [
    { kind: "INSPECT", name: "INSPECT", tag: "TOP CARD", source: item },
    ...[...groups.values()].map(group => {
      const action = group[0];
      const art = action.type === "USE_ART" ? topCard(item.holomem)?.arts?.[action.artIndex] : null;
      const ability = action.type === "USE_OSHI_SKILL" ? card(item.cardId)?.abilities?.[action.abilityIndex] : null;
      return { kind: "ACTION", name: actionName(action, item), tag: art ? "ART" : ability ? "OSHI SKILL" : "ACTION", group, source: item, art, ability };
    }),
    ...attachedCardItems(item),
  ];
  dialogStack.push({ title: `${item.name} — ACTION`, items, index: 0, level: "ACTIONS", source: item });
  renderDialog();
}

function artHeadingFontSize(art) {
  const labelLength = Math.max(1, `${art?.name ?? ""} · ${art?.damage ?? ""}`.length);
  const costWidth = Math.max(8, (art?.cost?.length ?? 0) * 6);
  return Math.max(5, Math.min(7, Math.floor((207 - costWidth) / (labelLength * 0.62))));
}

function fitDialogTitle(title) {
  const labelLength = Math.max(1, String(title).length);
  let fontSize = Math.max(6, Math.min(11, Math.floor((350 / labelLength - 1) / 0.62)));
  ui.dialogTitle.style.fontSize = `${fontSize}px`;
  ui.dialogTitle.style.letterSpacing = fontSize <= 7 ? "0" : fontSize <= 9 ? ".5px" : "1px";
  while (ui.dialogTitle.clientWidth > 0 && ui.dialogTitle.scrollWidth > ui.dialogTitle.clientWidth && fontSize > 5) {
    fontSize--;
    ui.dialogTitle.style.fontSize = `${fontSize}px`;
    ui.dialogTitle.style.letterSpacing = fontSize <= 7 ? "0" : ".5px";
  }
}

function fitArtActionHeadings() {
  ui.dialogList.querySelectorAll(".art-action-heading strong").forEach(heading => {
    let fontSize = Number.parseFloat(heading.style.fontSize) || 7;
    while (heading.clientWidth > 0 && heading.scrollWidth > heading.clientWidth && fontSize > 4) {
      fontSize--;
      heading.style.fontSize = `${fontSize}px`;
    }
  });
}

function attachedCardItems(item) {
  const holomem = item?.holomem;
  if (!holomem) return [];
  const attachment = (instance, attachmentType, tag) => ({
    kind: "ATTACHMENT", uid: instance.uid, cardId: instance.cardId,
    name: card(instance.cardId)?.name ?? instance.cardId, attachmentType, tag,
  });
  const stacked = holomem.stack.slice(0, -1).reverse().map(instance => {
    const definition = card(instance.cardId);
    return attachment(instance, "STACK", `STACK · ${definition?.bloomLevel ?? "HOLOMEM"}`);
  });
  const cheers = holomem.cheers.map(instance => {
    const definition = card(instance.cardId);
    return attachment(instance, "CHEER", `CHEER · ${definition?.provides ?? "NEUTRAL"}`);
  });
  const supports = holomem.supports.map(instance => {
    const definition = card(instance.cardId);
    const subtype = definition?.supportType ?? "SUPPORT";
    return attachment(instance, subtype.toUpperCase(), `ATTACHED · ${subtype.toUpperCase()}`);
  });
  return [...stacked, ...cheers, ...supports];
}

function openInspect(item) {
  const definition = card(item?.cardId);
  if (!definition) return;
  ui.inspectImage.src = imagePath(definition);
  ui.inspectImage.alt = definition.name;
  ui.inspectName.textContent = definition.name;
  showScreen("INSPECT");
}

function closeInspect() {
  showScreen("DIALOG");
  renderDialog();
}

function chooseActionGroup(item) {
  const action = item.group[0];
  const alwaysChooseTarget = ["BLOOM", "BATON_PASS", "USE_ART"].includes(action.type);
  if (alwaysChooseTarget || item.group.length > 1) {
    beginTableTarget({
      kind: "ACTION",
      title: item.name,
      message: `${item.name}: choose a highlighted target on the table.`,
      actions: item.group,
    });
  } else submitAction(action);
}

function renderDialogDetail(item) {
  if (!item) return "<div class='detail-text'>Nothing is available here.</div>";
  if (item.kind === "LOG") return `<div class="detail-name">BATTLE LOG</div><div class="detail-text">${escapeHtml(item.name)}<br><br>${escapeHtml(item.text)}</div>`;
  const definition = item.cardId ? card(item.cardId) : item.source?.cardId ? card(item.source.cardId) : null;
  const stageItem = item.holomem ? item : item.source?.holomem ? item.source : null;
  const status = stageItem ? { holomem: stageItem.holomem, zone: stageItem.zone } : null;
  const instruction = item.kind === "INSPECT" ? `<div class="action-block">▶ OPEN FULL-SIZE CARD ART</div>` : item.kind === "ATTACHMENT" ? `<div class="action-block">▶ INSPECT ATTACHED CARD</div>` : item.kind === "ACTION" ? `<div class="action-block">▶ SELECT ACTION</div>` : item.kind === "TARGET" ? `<div class="action-block">▶ CONFIRM TARGET</div>` : "";
  return cardDetailHtml(definition, instruction, status);
}

function renderDialog() {
  const view = dialogStack.at(-1);
  const sideToggleRoot = view.level === "CARDS" && ["BACKSTAGE", "OSHI"].includes(view.title) ? view : null;
  const dialogTitle = sideToggleRoot ? `${view.title} — ${sideToggleRoot.fieldOwner === "P1" ? "YOURS" : "OPPONENT"}` : view.title;
  ui.dialogTitle.textContent = dialogTitle;
  ui.dialogCount.textContent = `${view.items.length}`;
  const handView = view.level === "CARDS" && view.title === "HAND";
  ui.dialogSort.classList.toggle("hidden", !handView);
  ui.dialogSort.textContent = handDisplaySorted ? "SORTED ✓" : "SORT HAND";
  ui.dialogZoneToggle.classList.toggle("hidden", !sideToggleRoot);
  if (sideToggleRoot) {
    ui.dialogZoneToggle.replaceChildren(...[["P1", "YOURS"], ["P2", "OPPONENT"]].map(([owner, label]) => {
      const button = document.createElement("button");
      button.className = `zone-toggle-button${sideToggleRoot.fieldOwner === owner ? " selected" : ""}`;
      button.textContent = label;
      button.addEventListener("click", () => view.title === "BACKSTAGE" ? switchBackstageView(owner) : switchOshiView(owner));
      return button;
    }));
  } else ui.dialogZoneToggle.replaceChildren();
  const attachmentCount = view.items.filter(item => item.kind === "ATTACHMENT").length;
  ui.dialogList.replaceChildren(...view.items.map((item, index) => {
    const row = document.createElement("div");
    const firstAttachment = item.kind === "ATTACHMENT" && view.items[index - 1]?.kind !== "ATTACHMENT";
    row.className = `list-entry${index === view.index ? " selected" : ""}${item.kind === "ATTACHMENT" ? " attachment-entry" : ""}${item.art ? " art-action-entry" : ""}${item.ability ? " oshi-action-entry" : ""}${firstAttachment ? " attachment-first" : ""}`;
    const cheerColors = Array.isArray(item.cheerColors)
      ? item.cheerColors
      : item.holomem?.cheers?.map(instance => card(instance.cardId)?.provides ?? "Neutral");
    const cheerIcons = cheerColors?.length
      ? `<span class="list-cheer-icons" aria-label="${cheerColors.length} attached Cheer">${cheerColors.map(color => `<img src="${cheerIconPath(color)}" alt="${escapeHtml(color)} Cheer" title="${escapeHtml(color)} Cheer">`).join("")}</span>`
      : "";
    const attachmentHeading = firstAttachment ? `<span class="attachment-section-label">CARD PILE · ${attachmentCount}</span>` : "";
    const mainContent = item.art
      ? `<span class="art-action-summary"><span class="art-action-heading">${requirementIcons(item.art.cost)}<strong style="font-size:${artHeadingFontSize(item.art)}px">${escapeHtml(item.art.name)} · ${item.art.damage}</strong></span><span class="art-action-effect">${escapeHtml(item.art.printedText || "No additional effect.")}</span></span>`
      : item.ability
        ? `<span class="oshi-action-summary"><span class="oshi-action-heading"><strong>${escapeHtml(item.ability.name)}</strong><b>POWER ${item.ability.holoPowerCost ?? 0} · ${escapeHtml(item.ability.usage ?? "")}</b></span><span class="oshi-action-effect">${escapeHtml(item.ability.printedText || "No additional effect.")}</span></span>`
      : `<span class="list-entry-name"><span>${escapeHtml(item.name)}</span>${cheerIcons}</span>`;
    row.innerHTML = `${attachmentHeading}<span class="cursor">${index === view.index ? "▶" : ""}</span>${mainContent}<span class="tag">${escapeHtml(item.tag ?? "")}</span>`;
    row.addEventListener("mouseenter", () => selectDialogItem(index));
    row.addEventListener("click", () => { selectDialogItem(index); activateDialogItem(); });
    return row;
  }));
  fitArtActionHeadings();
  ui.dialogList.children[view.index]?.scrollIntoView({ block: "nearest" });
  ui.cardDetail.innerHTML = renderDialogDetail(view.items[view.index]);
  ui.dialogHelp.textContent = sideToggleRoot ? `← → YOUR/OPPONENT ${view.title} · ↑ ↓ CARD · ENTER ACTIONS` : handView ? "↑ ↓ CARD · S SORT HAND · ENTER ACTIONS · ESC CLOSE" : view.level === "CARDS" ? "↑ ↓ CARD · ENTER VIEW ACTIONS · ESC CLOSE" : view.level === "ACTIONS" ? "↑ ↓ ACTION · ENTER SELECT · ESC CARDS" : "↑ ↓ TARGET · ENTER CONFIRM · ESC ACTIONS";
  fitDialogTitle(dialogTitle);
}

function selectDialogItem(index) {
  const view = dialogStack.at(-1);
  if (!view?.items[index]) return;
  view.index = index;
  [...ui.dialogList.children].forEach((row, rowIndex) => {
    row.classList.toggle("selected", rowIndex === index);
    row.querySelector(".cursor").textContent = rowIndex === index ? "▶" : "";
  });
  ui.dialogList.children[index]?.scrollIntoView({ block: "nearest" });
  ui.cardDetail.innerHTML = renderDialogDetail(view.items[index]);
}

function backDialog() {
  dialogStack.pop();
  if (!dialogStack.length) {
    showScreen("BATTLE");
    renderBattle();
    return;
  }
  renderDialog();
}

function activateDialogItem() {
  const view = dialogStack.at(-1);
  const item = view?.items[view.index];
  if (!item) return;
  if (view.level === "CARDS") {
    if (item.kind !== "LOG") openCardActions(item);
  } else if (view.level === "ACTIONS" && item.kind === "INSPECT") openInspect(item.source);
  else if (view.level === "ACTIONS" && item.kind === "ATTACHMENT") openInspect(item);
  else if (view.level === "ACTIONS" && item.kind === "ACTION") chooseActionGroup(item);
  else if (view.level === "TARGETS") submitAction(item.action);
}

async function submitAction(action, targetFallback = null) {
  if (busy || !action) return;
  busy = true;
  try {
    const previousModel = model;
    const nextModel = await api("/api/action", { action });
    tableTargetMode = null;
    dialogStack = [];
    await playResponse(nextModel, previousModel);
  } catch (error) {
    showToast(error.message);
    if (targetFallback) {
      tableTargetMode = targetFallback;
      showScreen("BATTLE");
      renderBattle();
    } else renderDialog();
  }
  finally { busy = false; }
}

function selectCommand(command) {
  if (command === "STEP") {
    if (nextStepAction()) promptNextStep();
    else showToast("You cannot end this phase yet.");
  } else openZone(command);
}

function promptNextStep() {
  const next = nextStepAction();
  if (!next) return showToast("You cannot end this phase yet.");
  stepConfirmIndex = 0;
  const current = `${model.state.phase[0]}${model.state.phase.slice(1).toLowerCase()} Step`;
  ui.stepConfirmMessage.textContent = `Leave ${current} and advance to ${nextStepLabel()}?`;
  showScreen("STEP_CONFIRM");
  renderStepConfirmChoice();
}

function cancelNextStep() {
  showScreen("BATTLE");
  renderBattle();
}

function confirmNextStep() {
  const next = nextStepAction();
  if (!next) return cancelNextStep();
  showScreen("BATTLE");
  renderBattle();
  submitAction(next);
}

function renderGameOver() {
  const won = model.state.winner === "P1";
  ui.resultTitle.textContent = model.state.status === "DRAW" ? "DRAW" : won ? "YOU WIN!" : "CPU WINS";
  const loser = won ? "P2" : "P1";
  ui.resultReason.textContent = model.state.lossReasons[loser]?.join("; ") ?? "The match is complete.";
  showScreen("GAME_OVER");
}

function handleModel() {
  if (model?.state?.status && model.state.status !== "ONGOING") return renderGameOver();
  if (model?.state?.pendingDecision) {
    const targetMode = pendingTableTargetMode(model.state.pendingDecision);
    if (targetMode) return beginTableTarget(targetMode);
    tableTargetMode = null;
    return renderFlow();
  }
  if (model?.flow && model.flow.step !== "PLAYING") {
    tableTargetMode = null;
    return renderFlow();
  }
  tableTargetMode = null;
  showScreen("BATTLE");
  renderBattle();
}

function promptForfeit() {
  confirmIndex = 0;
  showScreen("FORFEIT");
  renderForfeitChoice();
}

async function confirmForfeit() {
  if (busy) return;
  busy = true;
  try {
    model = await api("/api/abandon-game", {});
    dialogStack = [];
    commandIndex = 0;
    battleFocus = "COMMAND";
    stageFocusIndex = { P1: 0, P2: 0 };
    bootIndex = 1;
    ui.battleMusic.pause();
    restartTitleIntro();
    showScreen("BOOT");
    renderBootMenu();
  } catch (error) { showToast(error.message); }
  finally { busy = false; }
}

async function exitGame() {
  if (busy) return;
  busy = true;
  [ui.titleMusic, ui.battleMusic].forEach(track => track.pause());
  try {
    await api("/api/shutdown", {});
    showScreen("EXITED");
    window.setTimeout(() => window.close(), 250);
  } catch (error) {
    showScreen("EXITED");
  }
}

function moveFlow(delta) {
  if (!flowItems.length) return;
  flowIndex = (flowIndex + flowItems.length + delta) % flowItems.length;
  renderFlow();
}

document.addEventListener("keydown", event => {
  unlockSfx();
  startMusic();
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape", " "].includes(event.key)) event.preventDefault();
  if (screen === "BOOT" && !titleStarted) {
    beginTitleMenu();
    return;
  }
  if (event.key.toLowerCase() === "m") {
    toggleMusic();
    return;
  }
  if (busy && event.key === "Enter" && advancePlayback) {
    advancePlayback();
    return;
  }
  if (busy) return;
  if (screen === "BOOT") {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      moveBoot(event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Enter") ui.bootMenu.children[bootIndex]?.click();
  }
  else if (screen === "DECK_SELECT") {
    const decks = model?.deckOptions ?? [];
    if (["ArrowUp", "ArrowLeft"].includes(event.key) && decks.length) { deckIndex = (deckIndex + decks.length - 1) % decks.length; renderDeckSelect(); }
    else if (["ArrowDown", "ArrowRight"].includes(event.key) && decks.length) { deckIndex = (deckIndex + 1) % decks.length; renderDeckSelect(); }
    else if (event.key === "Enter") ui.deckOptions.children[deckIndex]?.click();
    else if (event.key === "Escape") { showScreen("BOOT"); renderBootMenu(); }
  }
  else if (screen === "OPTIONS") {
    if (event.key === "ArrowUp") { optionsIndex = (optionsIndex + 3) % 4; renderOptions(); }
    else if (event.key === "ArrowDown") { optionsIndex = (optionsIndex + 1) % 4; renderOptions(); }
    else if (event.key === "ArrowLeft" && optionsIndex < 3) adjustSelectedOption(-1);
    else if (event.key === "ArrowRight" && optionsIndex < 3) adjustSelectedOption(1);
    else if (event.key === "Enter") {
      if (optionsIndex === 3) { showScreen("BOOT"); renderBootMenu(); }
      else adjustSelectedOption(1);
    } else if (event.key === "Escape") { showScreen("BOOT"); renderBootMenu(); }
  }
  else if (screen === "OSHI_SELECT") {
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) { oshiIndex = oshiIndex === 0 ? 1 : 0; renderOshiSelect(); }
    else if (event.key === "Enter") startPregame();
    else if (event.key === "Escape") { showScreen("DECK_SELECT"); renderDeckSelect(); }
  } else if (screen === "FLOW") {
    if (event.key === "ArrowUp") moveFlow(-1);
    else if (event.key === "ArrowDown") moveFlow(1);
    else if (event.key === "ArrowLeft" && ui.flowActions.children.length) {
      flowActionIndex = (flowActionIndex + ui.flowActions.children.length - 1) % ui.flowActions.children.length;
      [...ui.flowActions.children].forEach((child, index) => child.classList.toggle("selected", index === flowActionIndex));
    } else if (event.key === "ArrowRight" && ui.flowActions.children.length) {
      flowActionIndex = (flowActionIndex + 1) % ui.flowActions.children.length;
      [...ui.flowActions.children].forEach((child, index) => child.classList.toggle("selected", index === flowActionIndex));
    }
    else if (event.key === " " && flowItems[flowIndex]) {
      const currentStep = model.state?.pendingDecision ? `DECISION_${model.state.pendingDecision.step}` : model.flow.step;
      if (["BACK", "BOTTOM", "DECISION_ORDER_BOTTOM", "DECISION_SELECT_ARCHIVE_CHEERS", "DECISION_SELECT_FIRST_GRAVITY_CARDS", "DECISION_ORDER_FIRST_GRAVITY_BOTTOM"].includes(currentStep)) {
        toggleFlowCard(flowItems[flowIndex].uid, ["DECISION_ORDER_BOTTOM", "DECISION_ORDER_FIRST_GRAVITY_BOTTOM"].includes(currentStep));
      }
    } else if (event.key === "Enter") ui.flowActions.children[flowActionIndex]?.click();
  } else if (screen === "BATTLE") {
    if (event.key === "ArrowUp") moveBattleRow(-1);
    else if (event.key === "ArrowDown") moveBattleRow(1);
    else if (event.key === "ArrowLeft") {
      if (battleFocus === "COMMAND") commandIndex = (commandIndex + COMMANDS.length - 1) % COMMANDS.length;
      else moveVisibleFocus(-1);
    } else if (event.key === "ArrowRight") {
      if (battleFocus === "COMMAND") commandIndex = (commandIndex + 1) % COMMANDS.length;
      else moveVisibleFocus(1);
    } else if (event.key === "Enter") {
      if (battleFocus === "COMMAND") selectCommand(COMMANDS[commandIndex]);
      else activateVisibleFocus();
    }
    else if (event.key === "Escape") {
      if (tableTargetMode) cancelTableTarget();
      else promptForfeit();
      return;
    }
    renderCommands();
    renderBattleFocus();
  } else if (screen === "FORFEIT") {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      confirmIndex = confirmIndex === 0 ? 1 : 0;
      renderForfeitChoice();
    } else if (event.key === "Enter") {
      if (confirmIndex === 0) { showScreen("BATTLE"); renderBattle(); }
      else confirmForfeit();
    } else if (event.key === "Escape") { showScreen("BATTLE"); renderBattle(); }
  } else if (screen === "STEP_CONFIRM") {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      stepConfirmIndex = stepConfirmIndex === 0 ? 1 : 0;
      renderStepConfirmChoice();
    } else if (event.key === "Enter") {
      if (stepConfirmIndex === 0) cancelNextStep();
      else confirmNextStep();
    } else if (event.key === "Escape") cancelNextStep();
  } else if (screen === "DIALOG") {
    const view = dialogStack.at(-1);
    if (event.key.toLowerCase() === "s" && view.level === "CARDS" && view.title === "HAND") {
      sortCurrentHand();
      return;
    }
    if (view.level === "CARDS" && ["BACKSTAGE", "OSHI"].includes(view.title) && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      const owner = view.fieldOwner === "P1" ? "P2" : "P1";
      if (view.title === "BACKSTAGE") switchBackstageView(owner);
      else switchOshiView(owner);
    }
    else if (event.key === "ArrowUp" && view.items.length) view.index = (view.index + view.items.length - 1) % view.items.length;
    else if (event.key === "ArrowDown" && view.items.length) view.index = (view.index + 1) % view.items.length;
    else if (event.key === "Enter") activateDialogItem();
    else if (event.key === "Escape") { backDialog(); return; }
    renderDialog();
  } else if (screen === "INSPECT" && ["Enter", "Escape"].includes(event.key)) {
    closeInspect();
  } else if (screen === "GAME_OVER" && event.key === "Enter") enterDeckSelect();
});

document.addEventListener("pointerdown", () => { unlockSfx(); startMusic(); }, { passive: true });
document.addEventListener("click", startMusic);

ui.boot.addEventListener("click", () => { if (!titleStarted) beginTitleMenu(); });
ui.actionPlayback.addEventListener("click", () => advancePlayback?.());
ui.inspectDialog.addEventListener("click", closeInspect);
ui.dialogBack.addEventListener("click", backDialog);
ui.dialogSort.addEventListener("click", sortCurrentHand);
ui.musicToggle.addEventListener("click", toggleMusic);
ui.vsAiButton.addEventListener("mouseenter", () => { bootIndex = 1; renderBootMenu(); });
ui.vsAiButton.addEventListener("click", () => { bootIndex = 1; renderBootMenu(); enterDeckSelect(); });
ui.optionsButton.addEventListener("mouseenter", () => { bootIndex = 2; renderBootMenu(); });
ui.optionsButton.addEventListener("click", () => { bootIndex = 2; renderBootMenu(); enterOptions(); });
ui.exitButton.addEventListener("mouseenter", () => { bootIndex = 3; renderBootMenu(); });
ui.exitButton.addEventListener("click", () => { bootIndex = 3; renderBootMenu(); exitGame(); });
ui.deckBack.addEventListener("click", () => { showScreen("BOOT"); renderBootMenu(); });
ui.oshiBack.addEventListener("click", () => { showScreen("DECK_SELECT"); renderDeckSelect(); });
[ui.optionsThemeRow, ui.optionsBgmRow, ui.optionsSfxRow, ui.optionsBack].forEach((row, index) => {
  row.addEventListener("mouseenter", () => { optionsIndex = index; renderOptions(); });
  if (index < 3) {
    row.querySelectorAll("button[data-adjust]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      optionsIndex = index;
      adjustSelectedOption(Number(button.dataset.adjust));
    }));
    row.addEventListener("click", event => { if (!event.target.closest("button")) { optionsIndex = index; adjustSelectedOption(1); } });
  }
});
ui.optionsBack.addEventListener("click", () => { showScreen("BOOT"); renderBootMenu(); });
ui.forfeitNo.addEventListener("click", () => { confirmIndex = 0; showScreen("BATTLE"); renderBattle(); });
ui.forfeitYes.addEventListener("click", () => { confirmIndex = 1; confirmForfeit(); });
ui.stepNo.addEventListener("click", () => { stepConfirmIndex = 0; cancelNextStep(); });
ui.stepYes.addEventListener("click", () => { stepConfirmIndex = 1; confirmNextStep(); });
ui.rematchButton.addEventListener("click", enterDeckSelect);
applyTheme();
renderBootMenu();
scheduleTitleIntroEnd();
