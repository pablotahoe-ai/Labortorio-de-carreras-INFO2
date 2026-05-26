const STORAGE_KEY = "design-race-lab-state-v2";
const LATEST_VIEW = "__latest__";
const CAR_SCAN_LIMIT = 80;
const PRACTICE_WEEKS = 24;
const TEACHER_CODE = "bruno1301";
const REMOTE_API_URL = String(window.DESIGN_RACE_API_URL || "").trim();
const SHARED_STATE_KEYS = ["students", "cars", "setups", "results", "nextCodeNumber"];

const today = () => new Date().toISOString().slice(0, 10);
let availableIconIds = [];
let selectedResultId = null;
let adminSelectedStudentId = null;
let audioGestureBound = false;
let remoteSaveTimer = null;
let applyingRemoteState = false;

const state = {
  students: [],
  cars: [],
  setups: [],
  results: [],
  activeStudentId: null,
  activeSetupId: null,
  selectedRaceDate: LATEST_VIEW,
  raceViewMode: "session",
  showCompetitorBest: true,
  showMyPreviousDates: true,
  audioEnabled: true,
  audioVolume: 0.55,
  nextCodeNumber: 1,
  adminSelectedStudentId: null,
  screen: "login",
};

const els = {
  loginScreen: document.querySelector("#loginScreen"),
  boxScreen: document.querySelector("#boxScreen"),
  raceScreen: document.querySelector("#raceScreen"),
  adminScreen: document.querySelector("#adminScreen"),
  registerForm: document.querySelector("#registerForm"),
  loginForm: document.querySelector("#loginForm"),
  boxForm: document.querySelector("#boxForm"),
  raceResultForm: document.querySelector("#raceResultForm"),
  carIconGrid: document.querySelector("#carIconGrid"),
  newCodeOutput: document.querySelector("#newCodeOutput"),
  sessionPill: document.querySelector("#sessionPill"),
  activePilotCard: document.querySelector("#activePilotCard"),
  historyDateSelect: document.querySelector("#historyDateSelect"),
  boxHistory: document.querySelector("#boxHistory"),
  goRaceButton: document.querySelector("#goRaceButton"),
  logoutButton: document.querySelector("#logoutButton"),
  backToBoxButton: document.querySelector("#backToBoxButton"),
  raceDateSelect: document.querySelector("#raceDateSelect"),
  viewSessionButton: document.querySelector("#viewSessionButton"),
  viewMyResultsButton: document.querySelector("#viewMyResultsButton"),
  viewMyBestButton: document.querySelector("#viewMyBestButton"),
  competitorsToggle: document.querySelector("#competitorsToggle"),
  previousDatesToggle: document.querySelector("#previousDatesToggle"),
  distanceMarkers: document.querySelector("#distanceMarkers"),
  carLayer: document.querySelector("#carLayer"),
  emptyState: document.querySelector("#emptyState"),
  markFeedback: document.querySelector("#markFeedback"),
  finishRaceButton: document.querySelector("#finishRaceButton"),
  statsPanel: document.querySelector("#statsPanel"),
  rankingTable: document.querySelector("#rankingTable"),
  exportButton: document.querySelector("#exportButton"),
  raceAudio: document.querySelector("#raceAudio"),
  audioToggle: document.querySelector("#audioToggle"),
  volumeControl: document.querySelector("#volumeControl"),
  markModal: document.querySelector("#markModal"),
  markModalContent: document.querySelector("#markModalContent"),
  closeMarkModalButton: document.querySelector("#closeMarkModalButton"),
  deleteMarkButton: document.querySelector("#deleteMarkButton"),
  adminStudents: document.querySelector("#adminStudents"),
  adminResults: document.querySelector("#adminResults"),
  adminLogoutButton: document.querySelector("#adminLogoutButton"),
  finishModal: document.querySelector("#finishModal"),
  finishOptions: document.querySelector("#finishOptions"),
  cancelFinishButton: document.querySelector("#cancelFinishButton"),
  confirmFinishButton: document.querySelector("#confirmFinishButton"),
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    Object.assign(state, JSON.parse(saved));
    migrateState();
  } catch {
    state.screen = "login";
  }
}

function migrateState() {
  const ordered = [...state.students].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const maxCodeNumber = ordered.reduce((max, student) => {
    const match = String(student.code || "").trim().match(/^UNMdP_(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  if (!Number.isFinite(Number(state.nextCodeNumber)) || Number(state.nextCodeNumber) <= maxCodeNumber) {
    state.nextCodeNumber = maxCodeNumber + 1;
  }
  const usedCodes = new Set();
  ordered.forEach((student) => {
    if (!student.normalizedKey) {
      student.normalizedKey = normalizeSurnames(student.surnameOne, student.surnameTwo);
    }
    if (!isValidStudentCode(student.code) || usedCodes.has(normalizeStudentCode(student.code))) {
      student.code = nextStudentCode(usedCodes);
    }
    usedCodes.add(normalizeStudentCode(student.code));
  });
  delete state.pendingResult;
  if (typeof state.raceViewMode !== "string") state.raceViewMode = "session";
  if (typeof state.showCompetitorBest !== "boolean") state.showCompetitorBest = true;
  if (typeof state.showMyPreviousDates !== "boolean") state.showMyPreviousDates = true;
  delete state.showGhosts;
  state.audioEnabled = true;
  state.audioVolume = 0.55;
}

function getSharedState() {
  return SHARED_STATE_KEYS.reduce((shared, key) => {
    shared[key] = state[key];
    return shared;
  }, {});
}

function applySharedState(sharedState) {
  if (!sharedState || typeof sharedState !== "object") return;
  applyingRemoteState = true;
  SHARED_STATE_KEYS.forEach((key) => {
    if (sharedState[key] !== undefined) state[key] = sharedState[key];
  });
  migrateState();
  if (state.activeStudentId && !getStudent(state.activeStudentId)) {
    state.activeStudentId = null;
    state.activeSetupId = null;
    state.screen = "login";
  }
  if (state.activeSetupId && !getSetup(state.activeSetupId)) {
    state.activeSetupId = null;
  }
  applyingRemoteState = false;
}

function hasRemoteApi() {
  return Boolean(REMOTE_API_URL);
}

function jsonpRequest(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `designRaceJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const separator = url.includes("?") ? "&" : "?";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Tiempo de espera agotado leyendo Google Sheets."));
    }, 10000);

    function cleanup() {
      clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("No se pudo cargar Google Sheets."));
    };
    script.src = `${url}${separator}callback=${callbackName}&t=${Date.now()}`;
    document.head.append(script);
  });
}

async function pullSharedState() {
  if (!hasRemoteApi()) return false;
  try {
    const payload = await jsonpRequest(REMOTE_API_URL);
    if (!payload.ok) throw new Error(payload.error || "No se pudo leer Google Sheets.");
    applySharedState(payload.state);
    saveState({ remote: false });
    return true;
  } catch (error) {
    console.warn("Design Race Lab: no se pudo sincronizar desde Google Sheets.", error);
    return false;
  }
}

async function pushSharedState() {
  if (!hasRemoteApi()) return false;
  try {
    await fetch(REMOTE_API_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({ state: getSharedState(), replace: state.screen === "admin" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await pullSharedState();
    return true;
  } catch (error) {
    console.warn("Design Race Lab: no se pudo sincronizar hacia Google Sheets.", error);
    return false;
  }
}

function scheduleRemoteSave() {
  if (!hasRemoteApi() || applyingRemoteState) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(() => {
    pushSharedState();
  }, 500);
}

function saveState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (options.remote !== false) scheduleRemoteSave();
}

async function saveStateNow() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return pushSharedState();
}

function imageExists(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = `${src}?v=${Date.now()}`;
  });
}

async function scanCarIcons() {
  const found = [];
  for (let iconId = 1; iconId <= CAR_SCAN_LIMIT; iconId += 1) {
    if (await imageExists(getIconPath(iconId))) found.push(iconId);
  }
  availableIconIds = found;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function normalizeWord(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-ZñÑ0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-AR");
}

function normalizeSurnames(one, two) {
  return [normalizeWord(one), normalizeWord(two)].filter(Boolean).sort().join("|");
}

function normalizeStudentCode(code) {
  return String(code || "").trim().toUpperCase();
}

function isValidStudentCode(code) {
  return /^UNMDP_\d{4,}$/i.test(String(code || "").trim());
}

function nextStudentCode(extraUsedCodes = new Set()) {
  const usedCodes = new Set([...state.students.map((student) => normalizeStudentCode(student.code)), ...extraUsedCodes]);
  const maxNumber = state.students.reduce((max, student) => {
    const match = String(student.code || "").trim().match(/^UNMdP_(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  let nextNumber = Math.max(maxNumber + 1, Number(state.nextCodeNumber) || 1);
  let code = `UNMdP_${String(nextNumber).padStart(4, "0")}`;
  while (usedCodes.has(normalizeStudentCode(code))) {
    nextNumber += 1;
    code = `UNMdP_${String(nextNumber).padStart(4, "0")}`;
  }
  state.nextCodeNumber = nextNumber + 1;
  return code;
}

function codeForSurnamesKey(key) {
  const existing = state.students.find((student) => student.normalizedKey === key);
  if (existing) return existing.code;
  return nextStudentCode();
}

function formatMeters(value) {
  return `${Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function formatDate(date) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function getStudent(id = state.activeStudentId) {
  return state.students.find((student) => student.id === id) || null;
}

function getCarByStudent(studentId = state.activeStudentId) {
  return state.cars.find((car) => car.studentId === studentId) || null;
}

function getCar(carId) {
  return state.cars.find((car) => car.id === carId) || null;
}

function getSetup(setupId = state.activeSetupId) {
  return state.setups.find((setup) => setup.id === setupId) || null;
}

function getResultBySetup(setupId) {
  return state.results.find((result) => result.setupId === setupId) || null;
}

function getStudentSetups(studentId = state.activeStudentId) {
  return state.setups.filter((setup) => setup.studentId === studentId).sort((a, b) => a.date.localeCompare(b.date));
}

function getStudentResults(studentId = state.activeStudentId) {
  return state.results.filter((result) => result.studentId === studentId).sort((a, b) => a.date.localeCompare(b.date));
}

function getLatestResultByCar(carId) {
  return state.results
    .filter((result) => result.carId === carId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0] || null;
}

function getBestResult(results) {
  return results.slice().sort((a, b) => b.distance - a.distance)[0] || null;
}

function getCompetitorBestResults() {
  const activeCar = getCarByStudent();
  return state.cars
    .filter((car) => car.id !== activeCar?.id)
    .map((car) => getBestResult(state.results.filter((result) => result.carId === car.id)))
    .filter(Boolean);
}

function getTrackResults() {
  if (state.selectedRaceDate !== LATEST_VIEW) {
    return state.results.filter((result) => result.date === state.selectedRaceDate).sort((a, b) => b.distance - a.distance);
  }

  const setup = getSetup();
  const currentSession = setup ? state.results.filter((result) => result.setupId === setup.id) : [];
  const myResults = getStudentResults();
  let ownResults = [];

  if (state.raceViewMode === "myAll") {
    ownResults = myResults;
  } else if (state.raceViewMode === "myBest") {
    ownResults = [getBestResult(myResults)].filter(Boolean);
  } else {
    ownResults = currentSession;
    if (state.showMyPreviousDates) {
      ownResults = [...ownResults, ...myResults.filter((result) => result.setupId !== state.activeSetupId)];
    }
  }

  const competitors = state.showCompetitorBest ? getCompetitorBestResults() : [];
  return [...ownResults, ...competitors].sort((a, b) => b.distance - a.distance);
}

function getAvailableRaceDates() {
  return [...new Set(state.results.map((result) => result.date))].sort();
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPracticeDates() {
  const savedDates = [...state.setups.map((setup) => setup.date), ...state.results.map((result) => result.date)];
  const generatedDates = Array.from({ length: PRACTICE_WEEKS }, (_, index) => addDays(today(), index * 7));
  return [...new Set([today(), ...savedDates, ...generatedDates])].sort();
}

function getIconPath(iconId) {
  return `assets/cars/car-${String(iconId).padStart(2, "0")}.png`;
}

function isIconUsed(iconId) {
  const activeCar = getCarByStudent();
  return state.cars.some((car) => car.iconId === iconId && car.id !== activeCar?.id);
}

function getFirstAvailableIconId() {
  return (availableIconIds.length ? availableIconIds : [1]).find((iconId) => !isIconUsed(iconId)) || null;
}

function showScreen(screen) {
  state.screen = screen;
  els.loginScreen.classList.toggle("hidden", screen !== "login");
  els.boxScreen.classList.toggle("hidden", screen !== "box");
  els.raceScreen.classList.toggle("hidden", screen !== "race");
  els.adminScreen.classList.toggle("hidden", screen !== "admin");
  saveState();
}

function createOrLoadStudent(surnameOne, surnameTwo) {
  const normalizedKey = normalizeSurnames(surnameOne, surnameTwo);
  const code = codeForSurnamesKey(normalizedKey);
  let student = state.students.find((item) => item.normalizedKey === normalizedKey || item.code === code);
  if (!student) {
    student = {
      id: uid("student"),
      surnameOne: surnameOne.trim(),
      surnameTwo: surnameTwo.trim(),
      normalizedKey,
      code,
      createdAt: new Date().toISOString(),
    };
    state.students.push(student);
  }
  return student;
}

function createCar(studentId, carName, iconId) {
  let car = getCarByStudent(studentId);
  if (!car) {
    car = {
      id: uid("car"),
      studentId,
      name: carName.trim(),
      iconId,
      createdAt: new Date().toISOString(),
    };
    state.cars.push(car);
  } else {
    car.name = carName.trim();
    car.iconId = iconId;
  }
  return car;
}

function saveSetup(formData) {
  const student = getStudent();
  const car = getCarByStudent();
  if (!student || !car) return null;

  const date = formData.get("testDate");
  let setup = state.setups.find((item) => item.studentId === student.id && item.date === date && !item.finalized);
  if (!setup) {
    setup = {
      id: uid("setup"),
      studentId: student.id,
      carId: car.id,
      date,
      createdAt: new Date().toISOString(),
    };
    state.setups.push(setup);
  }

  Object.assign(setup, {
    wheelbase: Number(formData.get("wheelbase")),
    wheelDiameter: Number(formData.get("wheelDiameter")),
    weight: formData.get("weight") === "" ? "" : Number(formData.get("weight")),
    notes: String(formData.get("notes") || "").trim(),
    updatedAt: new Date().toISOString(),
  });

  state.activeSetupId = setup.id;
  return setup;
}

function addResult(distance) {
  const setup = getSetup();
  if (!setup || setup.finalized) return;
  const payload = {
    setupId: setup.id,
    studentId: setup.studentId,
    carId: setup.carId,
    date: setup.date,
    distance,
    notes: setup.notes,
    wheelbase: setup.wheelbase,
    wheelDiameter: setup.wheelDiameter,
    weight: setup.weight,
  };
  state.results.push({ id: uid("result"), ...payload, createdAt: new Date().toISOString() });
}

function renderPracticeDateOptions() {
  const currentValue = els.boxForm.testDate.value || today();
  els.boxForm.testDate.innerHTML = getPracticeDates()
    .map((date) => `<option value="${date}">${formatDate(date)}</option>`)
    .join("");
  els.boxForm.testDate.value = getPracticeDates().includes(currentValue) ? currentValue : today();
}

function renderIconGrid() {
  const icons = availableIconIds.length ? availableIconIds : [1];
  const selectedIcon = getCarByStudent()?.iconId || getFirstAvailableIconId();
  els.carIconGrid.innerHTML = "";
  icons.forEach((iconId) => {
    const disabled = isIconUsed(iconId);
    const label = document.createElement("label");
    label.className = `car-icon-option ${disabled ? "disabled" : ""}`;
    label.innerHTML = `
      <input type="radio" name="carIcon" value="${iconId}" ${iconId === selectedIcon && !disabled ? "checked" : ""} ${disabled ? "disabled" : ""} required />
      <span class="icon-preview">
        <img src="${getIconPath(iconId)}" alt="Auto ${iconId}" onerror="this.classList.add('missing')" />
      </span>
    `;
    els.carIconGrid.append(label);
  });
}

function renderSession() {
  const student = getStudent();
  const car = getCarByStudent();
  els.sessionPill.textContent = student && car ? `${student.code} · ${car.name}` : "Sin pilotos activos";
}

function renderAudioControls() {
  els.raceAudio.volume = Number(state.audioVolume ?? 0.55);
  els.raceAudio.muted = !state.audioEnabled;
  els.volumeControl.value = Math.round(els.raceAudio.volume * 100);
  els.audioToggle.textContent = state.audioEnabled ? "Audio on" : "Audio off";
  els.audioToggle.setAttribute("aria-pressed", String(state.audioEnabled));
}

async function syncAudioPlayback() {
  renderAudioControls();
  if (!state.audioEnabled) {
    els.raceAudio.pause();
    return;
  }
  try {
    await els.raceAudio.play();
  } catch {
    renderAudioControls();
  }
}

function canStartRaceAudio() {
  return state.screen === "race" && state.audioEnabled && els.raceAudio.paused;
}

function bindAudioGestureStart() {
  if (audioGestureBound) return;
  audioGestureBound = true;
  const startAudio = () => {
    if (canStartRaceAudio()) syncAudioPlayback();
  };
  ["pointerdown", "click", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, startAudio, { passive: true });
  });
}

function renderPilotCard() {
  const student = getStudent();
  const car = getCarByStudent();
  if (!student || !car) {
    els.activePilotCard.innerHTML = "";
    return;
  }
  els.activePilotCard.innerHTML = `
    <div class="pilot-card">
      <div class="race-car-icon large">${renderCarIcon(car)}</div>
      <div>
        <span class="section-kicker">Pilotos activos</span>
        <h3>${escapeHtml(student.surnameOne)} ${escapeHtml(student.surnameTwo)}</h3>
        <p>${escapeHtml(car.name)}</p>
        <strong class="access-code">${student.code}</strong>
      </div>
    </div>
  `;
}

function renderCarIcon(car) {
  return `
    <img src="${getIconPath(car.iconId)}" alt="${escapeHtml(car.name)}" onerror="this.classList.add('missing')" />
  `;
}

function applyLastSetupDefaults() {
  const selectedDate = els.boxForm.testDate.value;
  const sameDate = getStudentSetups().find((setup) => setup.date === selectedDate && !setup.finalized);
  const lastSetup = getStudentSetups().filter((setup) => setup.date < selectedDate).at(-1) || getStudentSetups().at(-1);
  const setup = sameDate || lastSetup;
  if (!setup) {
    state.activeSetupId = null;
    return;
  }

  els.boxForm.wheelbase.value = setup.wheelbase ?? "";
  els.boxForm.wheelDiameter.value = setup.wheelDiameter ?? "";
  els.boxForm.weight.value = setup.weight ?? "";
  els.boxForm.notes.value = sameDate ? setup.notes || "" : "";
  state.activeSetupId = sameDate ? sameDate.id : null;
}

function renderBoxHistory() {
  const setups = getStudentSetups();
  els.historyDateSelect.innerHTML = setups.length
    ? setups.map((setup) => `<option value="${setup.id}">${formatDate(setup.date)}</option>`).join("")
    : `<option value="">Sin fechas registradas</option>`;

  const visibleSetup = getSetup(els.historyDateSelect.value) || getSetup() || setups.at(-1);
  if (!visibleSetup) {
    els.boxHistory.innerHTML = `<p class="empty-inline">Todavía no hay datos de box para este auto.</p>`;
    return;
  }
  const result = getResultBySetup(visibleSetup.id);
  const resultCount = state.results.filter((item) => item.setupId === visibleSetup.id).length;
  els.historyDateSelect.value = visibleSetup.id;
  els.boxHistory.innerHTML = `
    <div class="history-card">
      <strong>${formatDate(visibleSetup.date)}</strong>
      <span>Largo entre ejes: ${visibleSetup.wheelbase} mm</span>
      <span>Diámetro rueda: ${visibleSetup.wheelDiameter} mm</span>
      <span>Peso: ${visibleSetup.weight === "" ? "sin cargar" : `${visibleSetup.weight} g`}</span>
      <span>Marcas cargadas: ${resultCount}</span>
      <span>Mejor marca del día: ${result ? formatMeters(Math.max(...state.results.filter((item) => item.setupId === visibleSetup.id).map((item) => item.distance))) : "sin marca"}</span>
      <p>${escapeHtml(visibleSetup.notes || "Sin anotaciones extra.")}</p>
    </div>
  `;
}

function renderRaceDates() {
  const dates = getAvailableRaceDates();
  els.raceDateSelect.innerHTML = `
    <option value="${LATEST_VIEW}">Último registro de cada auto</option>
    ${dates.map((date) => `<option value="${date}">${formatDate(date)}</option>`).join("")}
  `;
  els.raceDateSelect.value = dates.includes(state.selectedRaceDate) ? state.selectedRaceDate : LATEST_VIEW;
  state.selectedRaceDate = els.raceDateSelect.value;
}

function renderMarkers(maxDistance) {
  const markerMax = Math.max(1, Math.ceil(maxDistance));
  els.distanceMarkers.innerHTML = "";
  for (let meter = 0; meter <= markerMax; meter += 1) {
    const marker = document.createElement("div");
    marker.className = "marker";
    marker.style.left = `${(meter / markerMax) * 100}%`;
    marker.innerHTML = `<span>${meter} m</span>`;
    els.distanceMarkers.append(marker);
  }
}

function createTrackCar(result, index, maxDistance, ghost = false) {
  const car = getCar(result.carId);
  const student = getStudent(result.studentId);
  if (!car || !student) return "";
  const laneCount = 6;
  const x = Math.max(0, Math.min(100, (result.distance / maxDistance) * 100));
  const y = 14 + (index % laneCount) * (72 / Math.max(1, laneCount - 1));
  const currentRaceMark = result.setupId === state.activeSetupId;
  return `
    <button class="track-car ${ghost ? "ghost" : ""} ${currentRaceMark ? "current-race-mark" : ""}" type="button" data-result-id="${result.id}" style="--x:${x}%;--y:${y}%">
      <div class="race-car-icon">${renderCarIcon(car)}</div>
      ${currentRaceMark ? `<span class="distance-callout">${formatMeters(result.distance)}</span>` : ""}
    </button>
  `;
}

function renderTrack() {
  const visibleResults = getTrackResults();
  const maxDistance = Math.max(1, Math.ceil(Math.max(...visibleResults.map((result) => result.distance), 1)));
  renderMarkers(maxDistance);
  els.emptyState.classList.toggle("hidden", visibleResults.length > 0);
  els.carLayer.innerHTML = visibleResults
    .map((result, index) => createTrackCar(result, index, maxDistance, result.setupId !== state.activeSetupId && result.studentId === state.activeStudentId))
    .join("");
}

function renderStats() {
  const visibleResults = getTrackResults();
  const setup = getSetup();
  const currentSession = setup ? state.results.filter((result) => result.setupId === setup.id) : [];
  const myResults = getStudentResults();
  if (!visibleResults.length) {
    els.statsPanel.innerHTML = `<p class="empty-inline">Poné una marca para ver estadísticas.</p>`;
    return;
  }
  const bestVisible = getBestResult(visibleResults);
  const bestSession = getBestResult(currentSession);
  const bestMine = getBestResult(myResults);
  const modeLabel = state.selectedRaceDate !== LATEST_VIEW
    ? `Fecha elegida: ${formatDate(state.selectedRaceDate)}`
    : state.raceViewMode === "myAll"
      ? "Todos mis resultados"
      : state.raceViewMode === "myBest"
        ? "Mi mejor marca"
        : "Sesión actual";

  els.statsPanel.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><span>Vista</span><strong>${escapeHtml(modeLabel)}</strong></div>
      <div class="stat"><span>Mejor visible</span><strong>${formatMeters(bestVisible.distance)}</strong><small>${formatDate(bestVisible.date)}</small></div>
      <div class="stat"><span>Mejor sesión actual</span><strong>${bestSession ? formatMeters(bestSession.distance) : "-"}</strong></div>
      <div class="stat"><span>Mi mejor histórica</span><strong>${bestMine ? formatMeters(bestMine.distance) : "-"}</strong></div>
    </div>
  `;
}

function renderRanking() {
  const ranking = getTrackResults();
  if (!ranking.length) {
    els.rankingTable.innerHTML = `<p class="empty-inline">Todavía no hay marcas públicas.</p>`;
    return;
  }
  els.rankingTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Pos.</th>
          <th>Estudiante</th>
          <th>Auto</th>
          <th>Fecha</th>
          <th>Distancia</th>
          <th>Setup</th>
        </tr>
      </thead>
      <tbody>
        ${ranking
          .map((result, index) => {
            const student = getStudent(result.studentId);
            const car = getCar(result.carId);
            return `
              <tr>
                <td class="rank">#${index + 1}</td>
                <td>${escapeHtml(`${student?.surnameOne || "-"} ${student?.surnameTwo || ""}`)}</td>
                <td>${escapeHtml(car?.name || "-")}</td>
                <td>${formatDate(result.date)}</td>
                <td>${formatMeters(result.distance)}</td>
                <td>${result.wheelbase} mm / ${result.wheelDiameter} mm</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderMarkFeedback() {
  const setup = getSetup();
  if (!setup) {
    els.markFeedback.textContent = "";
    return;
  }
  const dayResults = state.results.filter((result) => result.setupId === setup.id);
  els.markFeedback.textContent = dayResults.length
    ? `Ya cargaste ${dayResults.length} marca${dayResults.length === 1 ? "" : "s"} para ${formatDate(setup.date)}. Podés poner otra.`
    : "Poné una marca para que el auto aparezca en la pista.";
}

function openMarkModal(resultId) {
  const result = state.results.find((item) => item.id === resultId);
  if (!result) return;
  const student = getStudent(result.studentId);
  const car = getCar(result.carId);
  const canDelete = result.setupId === state.activeSetupId && result.studentId === state.activeStudentId && state.screen === "race";
  selectedResultId = result.id;
  els.markModalContent.innerHTML = `
    <span class="section-kicker">Marca registrada</span>
    <h3 id="markModalTitle">${formatMeters(result.distance)}</h3>
    <p>${escapeHtml(student ? `${student.surnameOne} ${student.surnameTwo}` : "-")}</p>
    <p>${escapeHtml(car?.name || "-")} · ${formatDate(result.date)}</p>
    <p>Entre ejes: ${result.wheelbase} mm · Rueda: ${result.wheelDiameter} mm · Peso: ${result.weight === "" ? "sin cargar" : `${result.weight} g`}</p>
    <p>${escapeHtml(result.notes || "Sin anotaciones extra.")}</p>
  `;
  els.deleteMarkButton.classList.toggle("hidden", !canDelete);
  els.markModal.classList.remove("hidden");
}

function closeMarkModal() {
  selectedResultId = null;
  els.markModal.classList.add("hidden");
}

function getCurrentSessionResults() {
  const setup = getSetup();
  return setup ? state.results.filter((result) => result.setupId === setup.id).sort((a, b) => b.distance - a.distance) : [];
}

async function finishRaceWithResult(resultId) {
  const setup = getSetup();
  if (!setup) return;
  const keep = state.results.find((result) => result.id === resultId && result.setupId === setup.id);
  if (!keep) return;
  state.results = state.results.filter((result) => result.setupId !== setup.id || result.id === keep.id);
  setup.finalized = true;
  state.activeSetupId = null;
  state.screen = "box";
  els.finishModal.classList.add("hidden");
  await saveStateNow();
  render();
}

async function openFinishModal() {
  const sessionResults = getCurrentSessionResults();
  if (!sessionResults.length) {
    els.markFeedback.textContent = "Primero poné una marca para cerrar la carrera.";
    return;
  }
  if (sessionResults.length === 1) {
    await finishRaceWithResult(sessionResults[0].id);
    return;
  }
  els.finishOptions.innerHTML = sessionResults
    .map((result, index) => `
      <label class="finish-option">
        <input type="radio" name="finalResult" value="${result.id}" ${index === 0 ? "checked" : ""} />
        <span>${formatMeters(result.distance)} · ${formatDate(result.date)}</span>
      </label>
    `)
    .join("");
  els.finishModal.classList.remove("hidden");
}

function exportToCSV() {
  const header = [
    "student_id",
    "student_code",
    "surname_one",
    "surname_two",
    "car_id",
    "car_name",
    "car_icon",
    "test_date",
    "wheelbase_mm",
    "wheel_diameter_mm",
    "weight_g",
    "distance_m",
    "notes",
  ];
  const rows = state.results.map((result) => {
    const student = getStudent(result.studentId);
    const car = getCar(result.carId);
    return [
      student?.id,
      student?.code,
      student?.surnameOne,
      student?.surnameTwo,
      car?.id,
      car?.name,
      car?.iconId,
      result.date,
      result.wheelbase,
      result.wheelDiameter,
      result.weight,
      result.distance,
      result.notes,
    ].map(escapeCsv);
  });
  const csv = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `design-race-lab-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderBox() {
  renderPracticeDateOptions();
  applyLastSetupDefaults();
  renderPilotCard();
  renderBoxHistory();
  els.goRaceButton.classList.toggle("hidden", !state.activeSetupId);
}

function renderRace() {
  renderRaceDates();
  renderTrack();
  renderStats();
  renderRanking();
  renderMarkFeedback();
  bindAudioGestureStart();
  if (canStartRaceAudio()) syncAudioPlayback();
  els.competitorsToggle.checked = state.showCompetitorBest;
  els.previousDatesToggle.checked = state.showMyPreviousDates;
  els.viewSessionButton.classList.toggle("active", state.raceViewMode === "session");
  els.viewMyResultsButton.classList.toggle("active", state.raceViewMode === "myAll");
  els.viewMyBestButton.classList.toggle("active", state.raceViewMode === "myBest");
}

function renderAdmin() {
  adminSelectedStudentId = state.adminSelectedStudentId || adminSelectedStudentId || null;
  els.adminStudents.innerHTML = state.students.length
    ? state.students
        .map((student) => {
          const car = getCarByStudent(student.id);
          return `
            <article class="admin-card ${student.id === adminSelectedStudentId ? "selected" : ""}" data-student-id="${student.id}">
              <button class="admin-select" type="button" data-action="select-student">${escapeHtml(student.surnameOne)} ${escapeHtml(student.surnameTwo)}</button>
              <label>Apellido 1<input data-field="surnameOne" value="${escapeHtml(student.surnameOne)}" /></label>
              <label>Apellido 2<input data-field="surnameTwo" value="${escapeHtml(student.surnameTwo)}" /></label>
              <label>Código<input data-field="code" value="${escapeHtml(student.code)}" /></label>
              <label>Auto<input data-car-field="name" value="${escapeHtml(car?.name || "")}" /></label>
              <label>Icono<input data-car-field="iconId" type="number" min="1" value="${car?.iconId || ""}" /></label>
              <div class="admin-actions">
                <button class="button secondary" type="button" data-action="save-student">Guardar</button>
                <button class="button primary" type="button" data-action="delete-student">Borrar persona</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="empty-inline">Todavía no hay pilotos registrados.</p>`;

  const selectedResults = adminSelectedStudentId ? state.results.filter((result) => result.studentId === adminSelectedStudentId) : [];
  els.adminResults.innerHTML = selectedResults.length
    ? selectedResults
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((result) => {
          const student = getStudent(result.studentId);
          const car = getCar(result.carId);
          return `
            <article class="admin-card" data-result-id="${result.id}">
              <strong>${formatMeters(result.distance)} · ${formatDate(result.date)}</strong>
              <span>${escapeHtml(student ? `${student.surnameOne} ${student.surnameTwo}` : "-")} · ${escapeHtml(car?.name || "-")}</span>
              <label>Distancia<input data-field="distance" type="number" step="0.01" value="${result.distance}" /></label>
              <div class="admin-actions">
                <button class="button secondary" type="button" data-action="save-result">Guardar</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="empty-inline">Seleccioná un equipo para ver sus marcas.</p>`;
}

function render() {
  renderIconGrid();
  renderSession();
  renderAudioControls();
  renderBox();
  renderRace();
  renderAdmin();
  showScreen(state.screen === "admin" ? "admin" : state.activeStudentId ? state.screen === "login" ? "box" : state.screen : "login");
}

els.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await pullSharedState();
  const form = new FormData(els.registerForm);
  const iconId = Number(form.get("carIcon"));
  if (!iconId || isIconUsed(iconId)) {
    els.newCodeOutput.textContent = "Ese icono ya fue elegido. Probá con otro auto.";
    return;
  }
  const student = createOrLoadStudent(form.get("surnameOne"), form.get("surnameTwo"));
  createCar(student.id, form.get("carName"), iconId);
  state.activeStudentId = student.id;
  state.screen = "box";
  els.newCodeOutput.textContent = `Tu código es ${student.code}. Guardalo para volver a entrar.`;
  saveState({ remote: false });
  await saveStateNow();
  els.newCodeOutput.textContent = `Tu código es ${(getStudent(student.id) || student).code}. Guardalo para volver a entrar.`;
  render();
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await pullSharedState();
  const rawCode = String(new FormData(els.loginForm).get("studentCode") || "").trim();
  if (rawCode.toLocaleLowerCase("es-AR") === TEACHER_CODE) {
    state.activeStudentId = null;
    state.activeSetupId = null;
    state.screen = "admin";
    saveState();
    render();
    return;
  }
  const code = rawCode.toUpperCase();
  const student = state.students.find((item) => String(item.code || "").toUpperCase() === code);
  if (!student) {
    alert("No encontré ese código en este navegador.");
    return;
  }
  state.activeStudentId = student.id;
  state.screen = "box";
  saveState();
  render();
});

els.boxForm.testDate.addEventListener("change", () => {
  applyLastSetupDefaults();
  renderBoxHistory();
});

els.boxForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveSetup(new FormData(els.boxForm));
  await saveStateNow();
  render();
});

els.historyDateSelect.addEventListener("change", renderBoxHistory);

els.goRaceButton.addEventListener("click", async () => {
  state.screen = "race";
  saveState();
  render();
  await syncAudioPlayback();
});

els.backToBoxButton.addEventListener("click", () => {
  state.screen = "box";
  saveState();
  render();
});

els.logoutButton.addEventListener("click", () => {
  state.activeStudentId = null;
  state.activeSetupId = null;
  state.screen = "login";
  saveState();
  render();
});

els.raceDateSelect.addEventListener("change", (event) => {
  state.selectedRaceDate = event.target.value;
  saveState();
  renderRace();
});

els.viewSessionButton.addEventListener("click", () => {
  state.raceViewMode = "session";
  saveState();
  renderRace();
});

els.viewMyResultsButton.addEventListener("click", () => {
  state.raceViewMode = "myAll";
  state.selectedRaceDate = LATEST_VIEW;
  saveState();
  renderRace();
});

els.viewMyBestButton.addEventListener("click", () => {
  state.raceViewMode = "myBest";
  state.selectedRaceDate = LATEST_VIEW;
  saveState();
  renderRace();
});

els.competitorsToggle.addEventListener("change", (event) => {
  state.showCompetitorBest = event.target.checked;
  saveState();
  renderRace();
});

els.previousDatesToggle.addEventListener("change", (event) => {
  state.showMyPreviousDates = event.target.checked;
  saveState();
  renderRace();
});

els.raceResultForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.raceResultForm);
  const meters = Number(form.get("meters"));
  const centimeters = Number(form.get("centimeters"));
  addResult(meters + centimeters / 100);
  els.raceResultForm.reset();
  await saveStateNow();
  renderRace();
});

els.carLayer.addEventListener("click", (event) => {
  const carButton = event.target.closest("[data-result-id]");
  if (!carButton) return;
  openMarkModal(carButton.dataset.resultId);
});

els.closeMarkModalButton.addEventListener("click", closeMarkModal);

els.markModal.addEventListener("click", (event) => {
  if (event.target === els.markModal) closeMarkModal();
});

els.deleteMarkButton.addEventListener("click", async () => {
  const result = state.results.find((item) => item.id === selectedResultId);
  if (!result || result.setupId !== state.activeSetupId || result.studentId !== state.activeStudentId || state.screen !== "race") return;
  state.results = state.results.filter((item) => item.id !== selectedResultId);
  closeMarkModal();
  await saveStateNow();
  renderRace();
});

els.finishRaceButton.addEventListener("click", async () => {
  await openFinishModal();
});

els.exportButton.addEventListener("click", async () => {
  await openFinishModal();
});

els.cancelFinishButton.addEventListener("click", () => {
  els.finishModal.classList.add("hidden");
});

els.confirmFinishButton.addEventListener("click", async () => {
  const selected = els.finishOptions.querySelector('input[name="finalResult"]:checked');
  if (!selected) return;
  await finishRaceWithResult(selected.value);
});

els.adminLogoutButton.addEventListener("click", () => {
  state.screen = "login";
  saveState();
  render();
});

els.adminStudents.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = event.target.closest("[data-student-id]");
  const student = getStudent(card.dataset.studentId);
  const car = getCarByStudent(student?.id);
  if (!student) return;
  if (button.dataset.action === "select-student") {
    adminSelectedStudentId = student.id;
    state.adminSelectedStudentId = student.id;
    saveState({ remote: false });
    render();
    return;
  } else if (button.dataset.action === "delete-student") {
    state.results = state.results.filter((result) => result.studentId !== student.id);
    state.setups = state.setups.filter((setup) => setup.studentId !== student.id);
    state.cars = state.cars.filter((item) => item.studentId !== student.id);
    state.students = state.students.filter((item) => item.id !== student.id);
    if (adminSelectedStudentId === student.id) {
      adminSelectedStudentId = state.students[0]?.id || null;
      state.adminSelectedStudentId = adminSelectedStudentId;
    }
  } else {
    const nextStudentData = {};
    card.querySelectorAll("[data-field]").forEach((input) => {
      nextStudentData[input.dataset.field] = input.value.trim();
    });
    const requestedCode = nextStudentData.code;
    const duplicatedCode = requestedCode && state.students.some((item) => item.id !== student.id && normalizeStudentCode(item.code) === normalizeStudentCode(requestedCode));
    if (duplicatedCode) {
      alert("Ese código ya está usado por otro equipo. Elegí otro o dejá el campo vacío para generar uno nuevo.");
      return;
    }
    Object.assign(student, nextStudentData);
    if (!isValidStudentCode(student.code)) {
      student.code = nextStudentCode(new Set([normalizeStudentCode(student.code)]));
    }
    student.normalizedKey = normalizeSurnames(student.surnameOne, student.surnameTwo);
    if (car) {
      card.querySelectorAll("[data-car-field]").forEach((input) => {
        car[input.dataset.carField] = input.dataset.carField === "iconId" ? Number(input.value) : input.value.trim();
      });
    }
  }
  await saveStateNow();
  render();
});

els.adminResults.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = event.target.closest("[data-result-id]");
  const result = state.results.find((item) => item.id === card.dataset.resultId);
  if (!result) return;
  if (button.dataset.action === "save-result") {
    const distance = Number(card.querySelector('[data-field="distance"]').value);
    result.distance = distance;
  }
  await saveStateNow();
  render();
});

els.audioToggle.addEventListener("click", async () => {
  state.audioEnabled = !state.audioEnabled;
  saveState();
  await syncAudioPlayback();
});

els.volumeControl.addEventListener("input", (event) => {
  state.audioVolume = Number(event.target.value) / 100;
  if (state.audioVolume > 0) state.audioEnabled = true;
  saveState();
  renderAudioControls();
  syncAudioPlayback();
});

async function init() {
  loadState();
  els.boxForm.testDate.value = today();
  await pullSharedState();
  await scanCarIcons();
  render();
}

init();
