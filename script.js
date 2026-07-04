"use strict";

const STORAGE_KEY = "skinRoutineTracker.v1";
const DATA_VERSION = 1;
const SENSITIVE_CONDITIONS = new Set(["dryness", "stinging", "redness", "peeling"]);
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const SKIN_CONDITIONS = [
  { id: "clear", label: "問題なし" },
  { id: "dryness", label: "乾燥" },
  { id: "stinging", label: "ヒリつき" },
  { id: "redness", label: "赤み" },
  { id: "peeling", label: "皮むけ" },
  { id: "acne", label: "ニキビ" },
  { id: "sunburn", label: "日焼けした" },
];

const STEPS = {
  cleanse: { id: "cleanse", name: "洗顔", detail: "こすらず、やさしく洗う" },
  missha: { id: "missha", name: "MISSHA Vita C Plus Toner", detail: "肌になじませる" },
  ceramedx: { id: "ceramedx", name: "Ceramedx Soothing Facial Lotion", detail: "保湿して肌を守る" },
  thayers: { id: "thayers", name: "Thayers Exfoliating 2% AHA Toner", detail: "目元・口元を避けて使用" },
  advanced: {
    id: "advanced",
    name: "Advanced Clinicals Glycolic + Lactic Acid Serum",
    detail: "週1回。少量から使用",
  },
  retinol: { id: "retinol", name: "RoC Retinol Correxion Capsules", detail: "1カプセルを薄くなじませる" },
  sunscreen: {
    id: "sunscreen",
    name: "Badger Kids Mineral Sunscreen SPF40",
    detail: "外出しない日も朝の仕上げに",
  },
  ceramedxOptional: {
    id: "ceramedx-optional",
    name: "Ceramedx Soothing Facial Lotion",
    detail: "乾燥を感じる場合に重ねる",
    optional: true,
  },
};

const dom = {};
let state = loadState();
let toastTimer;
let skinSavedTimer;
let selectedDateKey = null;
let selectedPeriod = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  [
    "phaseLabel",
    "dateLabel",
    "weekdayLabel",
    "periodBadge",
    "periodDescription",
    "recordDate",
    "returnToCurrentButton",
    "historyEditPanel",
    "editModeLabel",
    "morningPeriodButton",
    "nightPeriodButton",
    "totalCountValue",
    "weekCountValue",
    "monthCountValue",
    "streakValue",
    "morningRate",
    "nightRate",
    "routineKicker",
    "routineTitle",
    "progressCount",
    "safetyNote",
    "safetyText",
    "cautionNote",
    "cautionText",
    "skipNote",
    "skipText",
    "routineList",
    "completeButton",
    "oneTapHint",
    "undoButton",
    "nextCard",
    "nextMessage",
    "nextRoutineTitle",
    "nextRoutineTime",
    "skinTitle",
    "skinOptions",
    "skinNote",
    "skinSaveStatus",
    "historyList",
    "settingsButton",
    "settingsSheet",
    "sheetBackdrop",
    "closeSettingsButton",
    "exportButton",
    "importButton",
    "importFile",
    "resetButton",
    "toast",
  ].forEach((id) => {
    dom[id] = document.getElementById(id);
  });

  renderSkinOptions();
  bindEvents();
  render();
  registerServiceWorker();

  window.setInterval(() => render(), 60_000);
}

function bindEvents() {
  dom.routineList.addEventListener("change", handleStepChange);
  dom.skinOptions.addEventListener("change", handleSkinChange);
  dom.skinNote.addEventListener("input", handleNoteInput);
  dom.completeButton.addEventListener("click", completeRoutine);
  dom.undoButton.addEventListener("click", undoCompletion);
  dom.recordDate.addEventListener("change", handleDateChange);
  dom.returnToCurrentButton.addEventListener("click", returnToCurrent);
  dom.morningPeriodButton.addEventListener("click", () => setHistoricalPeriod("morning"));
  dom.nightPeriodButton.addEventListener("click", () => setHistoricalPeriod("night"));
  dom.settingsButton.addEventListener("click", openSettings);
  dom.closeSettingsButton.addEventListener("click", closeSettings);
  dom.sheetBackdrop.addEventListener("click", closeSettings);
  dom.exportButton.addEventListener("click", exportData);
  dom.importButton.addEventListener("click", () => dom.importFile.click());
  dom.importFile.addEventListener("change", importData);
  dom.resetButton.addEventListener("click", resetData);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  });
}

function render() {
  const currentContext = getCurrentContext();
  const context = getViewContext(currentContext);
  const entry = getPeriodEntry(context.dateKey, context.period);
  const routine = entry.completedAt ? getCompletedRoutine(entry) : buildRoutine(context, entry.skin);
  const dayNumber = daysBetween(parseDateKey(state.createdAt), parseDateKey(context.dateKey)) + 1;

  dom.phaseLabel.textContent = context.isHistorical
    ? `過去の記録 · ${dayNumber >= 31 ? "2か月目" : "1か月目"}`
    : dayNumber >= 31
      ? `2か月目 · ${dayNumber}日目`
      : `1か月目 · ${Math.max(1, dayNumber)}日目`;
  dom.dateLabel.textContent = `${context.date.getMonth() + 1}月${context.date.getDate()}日`;
  dom.weekdayLabel.textContent = `（${WEEKDAYS[context.date.getDay()]}）`;
  dom.periodBadge.textContent = context.period === "morning" ? "朝" : "夜";
  dom.periodBadge.classList.toggle("night", context.period === "night");
  dom.periodDescription.textContent =
    context.period === "morning" ? "04:00–15:59 のモーニングケア" : "16:00–翌03:59 のナイトケア";
  dom.recordDate.min = state.createdAt;
  dom.recordDate.max = currentContext.dateKey;
  dom.recordDate.value = context.dateKey;
  dom.returnToCurrentButton.hidden = !context.isHistorical;
  dom.historyEditPanel.hidden = false;
  dom.editModeLabel.textContent = context.isHistorical ? "記録を補正中" : "表示する時間帯";
  dom.morningPeriodButton.setAttribute("aria-pressed", String(context.period === "morning"));
  dom.nightPeriodButton.setAttribute("aria-pressed", String(context.period === "night"));
  dom.nightPeriodButton.disabled =
    context.dateKey === currentContext.dateKey && currentContext.period === "morning";
  dom.routineKicker.textContent = context.isHistorical ? "PAST ROUTINE" : "TODAY'S ROUTINE";
  dom.routineTitle.textContent = context.isHistorical ? "この日にやったこと" : "今日やること";
  dom.skinTitle.textContent = context.isHistorical ? "この日の肌状態" : "いまの肌状態";

  renderRoutine(context, routine, entry);
  renderSkinSelection(entry.skin);
  if (document.activeElement !== dom.skinNote) dom.skinNote.value = entry.note;
  renderStats(currentContext);
  renderHistory(currentContext);
  renderNext(context, Boolean(entry.completedAt));
}

function getViewContext(currentContext = getCurrentContext()) {
  if (!selectedDateKey) return { ...currentContext, isHistorical: false };
  const date = parseDateKey(selectedDateKey);
  return {
    now: currentContext.now,
    period: selectedPeriod || currentContext.period,
    date,
    dateKey: selectedDateKey,
    isHistorical:
      selectedDateKey !== currentContext.dateKey || (selectedPeriod || currentContext.period) !== currentContext.period,
  };
}

function handleDateChange(event) {
  const currentContext = getCurrentContext();
  const nextDateKey = event.target.value;
  if (!isDateKey(nextDateKey) || nextDateKey < state.createdAt || nextDateKey > currentContext.dateKey) {
    render();
    return;
  }
  if (nextDateKey === currentContext.dateKey) {
    returnToCurrent();
    return;
  }
  selectedDateKey = nextDateKey;
  selectedPeriod = currentContext.period;
  render();
}

function setHistoricalPeriod(period) {
  if (!["morning", "night"].includes(period)) return;
  const currentContext = getCurrentContext();
  const dateKey = selectedDateKey || currentContext.dateKey;
  if (dateKey === currentContext.dateKey && currentContext.period === "morning" && period === "night") return;
  selectedDateKey = dateKey;
  selectedPeriod = period;
  if (selectedDateKey === currentContext.dateKey && selectedPeriod === currentContext.period) {
    selectedDateKey = null;
    selectedPeriod = null;
  }
  render();
}

function returnToCurrent() {
  selectedDateKey = null;
  selectedPeriod = null;
  render();
}

function getCompletedRoutine(entry) {
  const stepMap = new Map(Object.values(STEPS).map((step) => [step.id, step]));
  const steps = entry.routine.map((stepId) => stepMap.get(stepId)).filter(Boolean);
  return { steps: steps.length ? steps : [STEPS.ceramedx], notice: "" };
}

function renderRoutine(context, routine, entry) {
  dom.routineList.innerHTML = "";

  routine.steps.forEach((step, index) => {
    const item = document.createElement("li");
    item.className = "routine-item";
    const label = document.createElement("label");
    label.className = "routine-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.stepId = step.id;
    input.checked = Boolean(entry.checks[step.id]);
    input.disabled = Boolean(entry.completedAt);

    const circle = document.createElement("span");
    circle.className = "check-circle";
    circle.setAttribute("aria-hidden", "true");
    circle.textContent = "✓";

    const copy = document.createElement("span");
    copy.className = "step-copy";
    const name = document.createElement("strong");
    name.textContent = step.name;
    const detail = document.createElement("small");
    detail.textContent = step.detail;
    copy.append(name, detail);
    if (step.optional) {
      const optional = document.createElement("span");
      optional.className = "optional-badge";
      optional.textContent = "必要なら";
      copy.append(optional);
    }

    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = String(index + 1).padStart(2, "0");
    label.append(input, circle, copy, number);
    item.append(label);
    dom.routineList.append(item);
  });

  const checkedCount = routine.steps.filter((step) => entry.checks[step.id]).length;
  dom.progressCount.textContent = `${checkedCount} / ${routine.steps.length}`;

  dom.safetyNote.hidden = !routine.notice;
  dom.safetyText.textContent = routine.notice || "";
  const guidance = getRoutineGuidance(context, routine);
  dom.cautionNote.hidden = !guidance.caution;
  dom.cautionText.textContent = guidance.caution || "";
  dom.skipNote.hidden = !guidance.skipped;
  dom.skipText.textContent = guidance.skipped || "";

  if (entry.completedAt) {
    dom.completeButton.disabled = true;
    dom.completeButton.classList.add("completed");
    dom.completeButton.innerHTML = "<span>やった ✓</span>";
    dom.oneTapHint.hidden = true;
    dom.undoButton.textContent = context.isHistorical ? "やってないに変更" : "完了を取り消す";
    dom.undoButton.hidden = false;
  } else {
    dom.completeButton.disabled = false;
    dom.completeButton.classList.remove("completed");
    dom.completeButton.innerHTML = '<span>やった</span><span aria-hidden="true">✓</span>';
    dom.oneTapHint.hidden = false;
    dom.undoButton.hidden = true;
  }
}

function getRoutineGuidance(context, routine) {
  const stepIds = new Set(routine.steps.map((step) => step.id));
  if (context.period === "morning") {
    return {
      caution: "",
      skipped: "Thayers、Advanced、RoC Retinolは朝は使いません。",
    };
  }

  const activeItems = [
    { id: "thayers", name: "Thayers" },
    { id: "advanced", name: "Advanced" },
    { id: "retinol", name: "RoC Retinol" },
  ];
  const skipped = activeItems.filter((item) => !stepIds.has(item.id)).map((item) => item.name);
  let caution = "";
  if (stepIds.has("thayers") || stepIds.has("advanced")) {
    caution = "AHAの日です。レチノールは重ねず、赤みやヒリつきが出たら洗い流して使用を休んでください。";
  } else if (stepIds.has("retinol")) {
    caution = "レチノールの日です。AHAは重ねず、少量から使用してください。";
  }
  return {
    caution,
    skipped: skipped.length ? `${skipped.join("、")}は使いません。` : "",
  };
}

function renderSkinOptions() {
  SKIN_CONDITIONS.forEach((condition) => {
    const label = document.createElement("label");
    label.className = "skin-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = condition.id;
    input.id = `skin-${condition.id}`;
    const text = document.createElement("span");
    text.textContent = condition.label;
    label.append(input, text);
    dom.skinOptions.append(label);
  });
}

function renderSkinSelection(selected) {
  dom.skinOptions.querySelectorAll("input").forEach((input) => {
    input.checked = selected.includes(input.value);
  });
}

function renderStats(context) {
  const stats = calculateStats(context);
  dom.totalCountValue.textContent = `${stats.totalCount}回`;
  dom.weekCountValue.textContent = `${stats.weekCount}回`;
  dom.monthCountValue.textContent = `${stats.monthCount}回`;
  dom.streakValue.textContent = `${stats.streak}日`;
  dom.morningRate.textContent = `${stats.morningRate}%`;
  dom.nightRate.textContent = `${stats.nightRate}%`;
}

function renderHistory(context) {
  dom.historyList.innerHTML = "";
  const recordedDates = Object.keys(state.entries)
    .filter((dateKey) => dateKey <= context.dateKey)
    .sort()
    .reverse()
    .slice(0, 7);

  if (!recordedDates.length) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "まだ記録はありません。最初のケアから始めましょう。";
    dom.historyList.append(empty);
    return;
  }

  recordedDates.forEach((dateKey) => {
    const day = state.entries[dateKey];
    const date = parseDateKey(dateKey);
    const row = document.createElement("div");
    row.className = "history-row";

    const label = document.createElement("span");
    label.className = "history-date";
    label.textContent = `${date.getMonth() + 1}/${date.getDate()} ${WEEKDAYS[date.getDay()]}`;
    row.append(label, createHistoryResult("朝", day.morning), createHistoryResult("夜", day.night));
    dom.historyList.append(row);
  });
}

function createHistoryResult(label, entry) {
  const result = document.createElement("span");
  result.className = "history-result";
  const dot = document.createElement("span");
  dot.className = `history-dot${entry?.completedAt ? " done" : ""}`;
  dot.setAttribute("aria-hidden", "true");
  result.append(dot, document.createTextNode(label));
  return result;
}

function renderNext(context, isComplete) {
  dom.nextCard.hidden = !isComplete;
  if (!isComplete) return;

  if (context.isHistorical) {
    dom.nextMessage.textContent = "記録を現実に合わせました";
    dom.nextRoutineTitle.textContent = `${context.period === "morning" ? "朝" : "夜"}は「やった」で記録済み`;
    dom.nextRoutineTime.textContent = "必要なら、いつでも変更できます";
    return;
  }

  dom.nextMessage.textContent = "おつかれさまでした";
  if (context.period === "morning") {
    dom.nextRoutineTitle.textContent = "次は夜のルーティン";
    dom.nextRoutineTime.textContent = "今日 16:00から";
  } else {
    dom.nextRoutineTitle.textContent = "次は朝のルーティン";
    dom.nextRoutineTime.textContent = "翌朝 04:00から";
  }
}

function buildRoutine(context, currentSkin) {
  if (context.period === "morning") {
    return { steps: [STEPS.cleanse, STEPS.missha, STEPS.ceramedx, STEPS.sunscreen], notice: "" };
  }

  const weekday = context.date.getDay();
  const blocker = getActiveBlocker(context.dateKey, currentSkin);
  if (blocker) {
    return { steps: [STEPS.cleanse, STEPS.ceramedx], notice: blocker };
  }

  switch (weekday) {
    case 2: {
      const advanced = canUseAdvanced(context.dateKey);
      if (advanced.allowed) {
        return {
          steps: [STEPS.cleanse, STEPS.advanced, STEPS.ceramedx],
          notice: "肌が安定しているため、今週はAdvancedを表示しています。",
        };
      }
      return {
        steps: [STEPS.cleanse, STEPS.thayers, STEPS.ceramedx],
        notice: advanced.notice,
      };
    }
    case 4:
      return { steps: [STEPS.cleanse, STEPS.ceramedx, STEPS.retinol, STEPS.ceramedxOptional], notice: "" };
    case 0:
      if (currentSkin.length === 1 && currentSkin[0] === "clear") {
        return {
          steps: [STEPS.cleanse, STEPS.thayers, STEPS.ceramedx],
          notice: "「問題なし」が記録されているため、AHAケアを表示しています。",
        };
      }
      return {
        steps: [STEPS.cleanse, STEPS.ceramedx],
        notice: "日曜のAHAは肌状態が「問題なし」のときだけ表示します。",
      };
    default:
      return { steps: [STEPS.cleanse, STEPS.ceramedx], notice: "" };
  }
}

function getActiveBlocker(dateKey, currentSkin) {
  const todayConditions = [...new Set([...getConditionsForDate(dateKey), ...currentSkin])];
  if (todayConditions.some((item) => SENSITIVE_CONDITIONS.has(item))) {
    return "乾燥・赤み・ヒリつき・皮むけがあるため、刺激のあるケアを休み、洗顔とCeramedxだけにしています。";
  }
  if (todayConditions.includes("sunburn")) {
    return "日焼けを記録したため、刺激のあるケアを休み、洗顔とCeramedxだけにしています。";
  }

  const yesterday = addDays(parseDateKey(dateKey), -1);
  if (getConditionsForDate(toDateKey(yesterday)).includes("sunburn")) {
    return "前日に日焼けが記録されたため、AHA・Advanced・レチノールを休止しています。";
  }

  for (let offset = 1; offset <= 3; offset += 1) {
    const previousKey = toDateKey(addDays(parseDateKey(dateKey), -offset));
    if (getConditionsForDate(previousKey).some((item) => SENSITIVE_CONDITIONS.has(item))) {
      return "直近3日間に肌トラブルが記録されたため、バリア回復を優先して洗顔とCeramedxだけにしています。";
    }
  }
  return "";
}

function canUseAdvanced(dateKey) {
  const dayNumber = daysBetween(parseDateKey(state.createdAt), parseDateKey(dateKey)) + 1;
  if (dayNumber < 31) return { allowed: false, notice: "" };

  const cooldownUntil = getAdvancedCooldownUntil();
  if (cooldownUntil && dateKey <= cooldownUntil) {
    return {
      allowed: false,
      notice: `Advancedは肌反応の記録により${formatShortDate(cooldownUntil)}まで休止し、Thayersに戻しています。`,
    };
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const previousKey = toDateKey(addDays(parseDateKey(dateKey), -offset));
    const conditions = getConditionsForDate(previousKey);
    if (conditions.some((item) => SENSITIVE_CONDITIONS.has(item) || item === "sunburn")) {
      return { allowed: false, notice: "直近7日間の肌状態を優先し、今週はAdvancedではなくThayersを表示しています。" };
    }
  }

  return { allowed: true, notice: "" };
}

function getAdvancedCooldownUntil() {
  const dates = Object.keys(state.entries).sort();
  let latestTrigger = null;

  dates.forEach((dateKey) => {
    const night = state.entries[dateKey]?.night;
    if (!night?.completedAt || !night.routine?.includes("advanced")) return;

    for (let offset = 0; offset <= 2; offset += 1) {
      const checkKey = toDateKey(addDays(parseDateKey(dateKey), offset));
      if (getConditionsForDate(checkKey).some((item) => ["redness", "stinging", "peeling"].includes(item))) {
        latestTrigger = dateKey;
      }
    }
  });

  return latestTrigger ? toDateKey(addDays(parseDateKey(latestTrigger), 14)) : null;
}

function handleStepChange(event) {
  const input = event.target.closest("input[data-step-id]");
  if (!input) return;
  const context = getViewContext();
  const entry = ensurePeriodEntry(context.dateKey, context.period);
  entry.checks[input.dataset.stepId] = input.checked;
  saveState();
  render();
}

function handleSkinChange(event) {
  const input = event.target.closest("input");
  if (!input) return;
  const context = getViewContext();
  const entry = ensurePeriodEntry(context.dateKey, context.period);

  if (input.value === "clear" && input.checked) {
    entry.skin = ["clear"];
  } else {
    entry.skin = entry.skin.filter((item) => item !== "clear" && item !== input.value);
    if (input.checked) entry.skin.push(input.value);
  }

  entry.skinUpdatedAt = new Date().toISOString();
  saveState();
  showSkinSaved();
  render();
}

function handleNoteInput(event) {
  const context = getViewContext();
  const entry = ensurePeriodEntry(context.dateKey, context.period);
  entry.note = event.target.value.slice(0, 500);
  entry.noteUpdatedAt = new Date().toISOString();
  saveState();
  showSkinSaved();
}

function completeRoutine() {
  const context = getViewContext();
  const entry = ensurePeriodEntry(context.dateKey, context.period);
  const routine = buildRoutine(context, entry.skin);
  routine.steps.filter((step) => !step.optional).forEach((step) => {
    entry.checks[step.id] = true;
  });

  entry.completedAt = new Date().toISOString();
  entry.routine = routine.steps.filter((step) => entry.checks[step.id]).map((step) => step.id);
  entry.backfilled = context.isHistorical;
  saveState();
  render();
  showToast(context.isHistorical ? "過去の記録を「やった」に変更しました" : "ルーティンを記録しました");
}

function undoCompletion() {
  const context = getViewContext();
  const message = context.isHistorical
    ? "この時間帯を「やってない」に変更しますか？"
    : "この時間帯の完了記録を取り消しますか？";
  if (!window.confirm(message)) return;
  const entry = ensurePeriodEntry(context.dateKey, context.period);
  entry.completedAt = null;
  entry.routine = [];
  entry.checks = {};
  entry.backfilled = context.isHistorical;
  saveState();
  render();
  showToast(context.isHistorical ? "「やってない」に変更しました" : "完了を取り消しました");
}

function calculateStats(context) {
  const today = context.date;
  const firstDay = maxDate(parseDateKey(state.createdAt), addDays(today, -29));
  const weekStart = startOfWeek(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let morningDue = 0;
  let morningDone = 0;
  let nightDue = 0;
  let nightDone = 0;
  let totalCount = 0;
  let weekCount = 0;
  let monthCount = 0;

  Object.entries(state.entries).forEach(([dateKey, day]) => {
    if (dateKey > context.dateKey) return;
    const date = parseDateKey(dateKey);
    const count = Number(Boolean(day.morning?.completedAt)) + Number(Boolean(day.night?.completedAt));
    totalCount += count;
    if (date >= weekStart) weekCount += count;
    if (date >= monthStart) monthCount += count;
  });

  for (let date = firstDay; date <= today; date = addDays(date, 1)) {
    const dateKey = toDateKey(date);
    const isPast = date < today;
    const morningIsDue = isPast || context.dateKey === dateKey;
    const nightIsDue = isPast || (context.dateKey === dateKey && context.period === "night");
    if (morningIsDue) {
      morningDue += 1;
      if (state.entries[dateKey]?.morning?.completedAt) morningDone += 1;
    }
    if (nightIsDue) {
      nightDue += 1;
      if (state.entries[dateKey]?.night?.completedAt) nightDone += 1;
    }
  }

  let streak = 0;
  let cursor = today;
  while (cursor >= parseDateKey(state.createdAt)) {
    const day = state.entries[toDateKey(cursor)];
    if (day?.morning?.completedAt && day?.night?.completedAt) break;
    cursor = addDays(cursor, -1);
  }

  while (cursor >= parseDateKey(state.createdAt)) {
    const day = state.entries[toDateKey(cursor)];
    if (!day?.morning?.completedAt || !day?.night?.completedAt) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return {
    totalCount,
    weekCount,
    monthCount,
    streak,
    morningRate: morningDue ? Math.round((morningDone / morningDue) * 100) : 0,
    nightRate: nightDue ? Math.round((nightDone / nightDue) * 100) : 0,
  };
}

function startOfWeek(date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function getCurrentContext(now = new Date()) {
  const hour = now.getHours();
  const period = hour >= 4 && hour < 16 ? "morning" : "night";
  const routineDate = hour < 4 ? addDays(startOfDay(now), -1) : startOfDay(now);
  return { now, period, date: routineDate, dateKey: toDateKey(routineDate) };
}

function getPeriodEntry(dateKey, period) {
  return state.entries[dateKey]?.[period] || emptyEntry();
}

function ensurePeriodEntry(dateKey, period) {
  if (!state.entries[dateKey]) {
    state.entries[dateKey] = { morning: emptyEntry(), night: emptyEntry() };
  }
  if (!state.entries[dateKey][period]) state.entries[dateKey][period] = emptyEntry();
  return state.entries[dateKey][period];
}

function emptyEntry() {
  return {
    checks: {},
    skin: [],
    skinUpdatedAt: null,
    note: "",
    noteUpdatedAt: null,
    completedAt: null,
    routine: [],
    backfilled: false,
  };
}

function getConditionsForDate(dateKey) {
  const day = state.entries[dateKey];
  if (!day) return [];
  return [...new Set([...(day.morning?.skin || []), ...(day.night?.skin || [])])];
}

function loadState() {
  const fallback = createInitialState();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(parsed);
  } catch (error) {
    console.warn("保存データを読み込めませんでした", error);
    return fallback;
  }
}

function createInitialState() {
  return {
    version: DATA_VERSION,
    createdAt: getCurrentContext().dateKey,
    updatedAt: new Date().toISOString(),
    entries: {},
  };
}

function normalizeState(value) {
  if (!value || typeof value !== "object" || value.version !== DATA_VERSION || typeof value.entries !== "object") {
    return createInitialState();
  }
  const normalized = {
    version: DATA_VERSION,
    createdAt: isDateKey(value.createdAt) ? value.createdAt : toDateKey(new Date()),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    entries: {},
  };

  Object.entries(value.entries).forEach(([dateKey, day]) => {
    if (!isDateKey(dateKey) || !day || typeof day !== "object") return;
    normalized.entries[dateKey] = {
      morning: normalizeEntry(day.morning),
      night: normalizeEntry(day.night),
    };
  });
  return normalized;
}

function normalizeEntry(entry) {
  const validConditions = new Set(SKIN_CONDITIONS.map((item) => item.id));
  return {
    checks: entry?.checks && typeof entry.checks === "object" ? { ...entry.checks } : {},
    skin: Array.isArray(entry?.skin) ? entry.skin.filter((item) => validConditions.has(item)) : [],
    skinUpdatedAt: typeof entry?.skinUpdatedAt === "string" ? entry.skinUpdatedAt : null,
    note: typeof entry?.note === "string" ? entry.note.slice(0, 500) : "",
    noteUpdatedAt: typeof entry?.noteUpdatedAt === "string" ? entry.noteUpdatedAt : null,
    completedAt: typeof entry?.completedAt === "string" ? entry.completedAt : null,
    routine: Array.isArray(entry?.routine) ? entry.routine.filter((item) => typeof item === "string") : [],
    backfilled: Boolean(entry?.backfilled),
  };
}

function saveState() {
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("保存できませんでした", error);
    showToast("記録を保存できませんでした");
  }
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `skin-routine-backup-${toDateKey(new Date())}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("記録を書き出しました");
}

async function importData(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || parsed.version !== DATA_VERSION || !parsed.entries || typeof parsed.entries !== "object") {
      throw new Error("形式が違います");
    }
    const imported = normalizeState(parsed);
    if (!window.confirm("現在の記録を、選択したバックアップで置き換えますか？")) return;
    state = imported;
    selectedDateKey = null;
    selectedPeriod = null;
    saveState();
    closeSettings();
    render();
    showToast("記録を復元しました");
  } catch (error) {
    console.error(error);
    showToast("このファイルは読み込めません");
  }
}

function resetData() {
  if (!window.confirm("すべての記録を削除します。この操作は元に戻せません。")) return;
  state = createInitialState();
  selectedDateKey = null;
  selectedPeriod = null;
  localStorage.removeItem(STORAGE_KEY);
  saveState();
  closeSettings();
  render();
  showToast("すべての記録をリセットしました");
}

function openSettings() {
  dom.sheetBackdrop.hidden = false;
  dom.settingsSheet.setAttribute("aria-hidden", "false");
  window.requestAnimationFrame(() => dom.settingsSheet.classList.add("open"));
  document.body.style.overflow = "hidden";
  dom.closeSettingsButton.focus();
}

function closeSettings() {
  if (!dom.settingsSheet?.classList.contains("open")) return;
  dom.settingsSheet.classList.remove("open");
  dom.settingsSheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  window.setTimeout(() => {
    dom.sheetBackdrop.hidden = true;
  }, 220);
  dom.settingsButton.focus();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, 2600);
}

function showSkinSaved() {
  window.clearTimeout(skinSavedTimer);
  dom.skinSaveStatus.textContent = "保存しました";
  dom.skinSaveStatus.classList.add("saved");
  skinSavedTimer = window.setTimeout(() => {
    dom.skinSaveStatus.textContent = "自動保存";
    dom.skinSaveStatus.classList.remove("saved");
  }, 1600);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("オフライン機能を開始できませんでした", error);
    });
  });
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDateKey(value).getTime());
}

function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

function maxDate(first, second) {
  return first > second ? first : second;
}

function formatShortDate(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
