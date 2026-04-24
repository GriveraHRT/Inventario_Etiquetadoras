const API_BASE_URL = "https://script.google.com/macros/s/AKfycbxmBjoAc3VVzZXEyK63iFo8jT2vnku08qoVlDi8tNLqmXgCxU9iw-yOSbKHyxafpF01Fw/exec";

const state = {
  isAdmin: false,
  password: "",
  bootstrap: null,
  selectedDeviceId: null,
};

const el = {
  locationsContainer: document.getElementById("locations-container"),
  deviceView: document.getElementById("device-view"),
  deviceTitle: document.getElementById("device-title"),
  deviceContent: document.getElementById("device-content"),
  refreshBtn: document.getElementById("refresh-btn"),
  closeDeviceView: document.getElementById("close-device-view"),
  adminBtn: document.getElementById("admin-btn"),
  adminDialog: document.getElementById("admin-dialog"),
  adminPassword: document.getElementById("admin-password"),
  adminLoginForm: document.getElementById("admin-login-form"),
  adminCancelBtn: document.getElementById("admin-cancel-btn"),
  locationDialog: document.getElementById("location-dialog"),
  locationForm: document.getElementById("location-form"),
  deviceDialog: document.getElementById("device-dialog"),
  deviceForm: document.getElementById("device-form"),
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindEvents();
  loadBootstrap();
}

function bindEvents() {
  el.refreshBtn.addEventListener("click", loadBootstrap);
  el.closeDeviceView.addEventListener("click", () => {
    el.deviceView.classList.add("hidden");
  });

  el.adminBtn.addEventListener("click", () => {
    if (state.isAdmin) {
      state.isAdmin = false;
      state.password = "";
      updateAdminUI();
      renderLocations();
      if (state.selectedDeviceId) renderDeviceView(state.selectedDeviceId);
      return;
    }
    el.adminDialog.showModal();
  });

  el.adminCancelBtn.addEventListener("click", () => el.adminDialog.close());
  el.adminLoginForm.addEventListener("submit", onAdminLogin);
  el.locationForm.addEventListener("submit", onSaveLocation);
  el.deviceForm.addEventListener("submit", onSaveDevice);
  document.getElementById("cancel-location-btn").addEventListener("click", () => el.locationDialog.close());
  document.getElementById("cancel-device-btn").addEventListener("click", () => el.deviceDialog.close());
  document.getElementById("delete-location-btn").addEventListener("click", onDeleteLocation);
  document.getElementById("delete-device-btn").addEventListener("click", onDeleteDevice);
}

async function loadBootstrap() {
  if (!isApiConfigured()) {
    showMessage("Configura API_BASE_URL en app.js para comenzar.");
    return;
  }
  showMessage("Cargando datos...");
  try {
    const data = await apiCall("getBootstrapData");
    state.bootstrap = data;
    renderLocations();
    if (state.selectedDeviceId) {
      renderDeviceView(state.selectedDeviceId);
    }
  } catch (error) {
    showMessage(`Error al cargar datos: ${error.message}`);
  }
}

function renderLocations() {
  if (!state.bootstrap) return;
  const { locations, devices } = state.bootstrap;
  const grouped = groupLocations(locations, devices);
  el.locationsContainer.innerHTML = "";

  grouped.forEach((floorObj) => {
    const floorContainer = createAccordion(floorObj.floorName, false);
    floorObj.areas.forEach((areaObj) => {
      const areaContainer = createAccordion(areaObj.areaName, true);
      areaObj.subareas.forEach((subObj) => {
        const subContainer = document.createElement("div");
        subContainer.className = "accordion-level";
        const header = document.createElement("button");
        header.className = "accordion-trigger";
        header.textContent = `${subObj.subareaName} (${subObj.devices.length})`;
        const panel = document.createElement("div");
        panel.className = "accordion-panel hidden";

        header.addEventListener("click", () => panel.classList.toggle("hidden"));
        subObj.devices.forEach((device) => {
          const card = document.createElement("article");
          card.className = "device-card";
          const button = document.createElement("button");
          button.className = "device-open";
          button.innerHTML = `<strong>${escapeHtml(device.nombrePractico)}</strong><br><span class="muted">${escapeHtml(device.modelo || "-")} | ${escapeHtml(device.tipoConexion || "-")}</span>`;
          button.addEventListener("click", () => {
            state.selectedDeviceId = device.id;
            renderDeviceView(device.id);
          });
          card.appendChild(button);
          panel.appendChild(card);
        });

        if (state.isAdmin) {
          const edit = document.createElement("button");
          edit.className = "btn ghost small";
          edit.textContent = "Editar sub-área";
          edit.addEventListener("click", () => openLocationDialog(subObj.location));
          panel.appendChild(edit);
        }

        subContainer.appendChild(header);
        subContainer.appendChild(panel);
        areaContainer.panel.appendChild(subContainer);
      });
      floorContainer.panel.appendChild(areaContainer.wrap);
    });
    if (state.isAdmin) {
      const addLocation = document.createElement("button");
      addLocation.className = "btn ghost small";
      addLocation.textContent = "Agregar ubicación";
      addLocation.addEventListener("click", () => openLocationDialog({ floor: floorObj.floorName }));
      floorContainer.panel.appendChild(addLocation);
    }
    el.locationsContainer.appendChild(floorContainer.wrap);
  });
}

function renderDeviceView(deviceId) {
  const device = state.bootstrap.devices.find((d) => d.id === deviceId);
  if (!device) return;
  const location = state.bootstrap.locations.find((l) => l.id === device.ubicacionId);
  const events = state.bootstrap.bitacora.filter((b) => b.dispositivoId === device.id);
  el.deviceTitle.textContent = device.nombrePractico || "Hoja de vida";
  el.deviceView.classList.remove("hidden");

  const adminControls = state.isAdmin
    ? `<div class="admin-actions">
         <button class="btn small" id="edit-device-inline">Editar equipo</button>
         <button class="btn ghost small" id="new-device-inline">Nuevo equipo</button>
       </div>`
    : "";

  el.deviceContent.innerHTML = `
    ${device.fotoUrl ? `<img src="${escapeHtml(device.fotoUrl)}" alt="Foto etiquetadora" />` : "<p class='muted'>Sin fotografía registrada.</p>"}
    <div class="kv">
      <p><strong>Nombre real:</strong> ${escapeHtml(device.nombreReal || "-")}</p>
      <p><strong>Serie:</strong> ${escapeHtml(device.numeroSerie || "-")}</p>
      <p><strong>Modelo:</strong> ${escapeHtml(device.modelo || "-")}</p>
      <p><strong>Conexión:</strong> ${escapeHtml(device.tipoConexion || "-")}</p>
      <p><strong>IP:</strong> ${escapeHtml(device.direccionIP || "-")}</p>
      <p><strong>Ubicación:</strong> ${escapeHtml(location ? `${location.piso} / ${location.area} / ${location.subarea}` : "-")}</p>
      <p><strong>Estado:</strong> ${escapeHtml(device.comentarioEstado || "-")}</p>
    </div>
    ${adminControls}
    <form id="event-form" class="event-form">
      <h3>Registrar evento</h3>
      <select id="event-type" required>
        <option value="">Seleccionar tipo</option>
        <option>Incidencia</option>
        <option>Atasco</option>
        <option>Mantenimiento preventivo</option>
        <option>Mantenimiento correctivo</option>
      </select>
      <textarea id="event-description" rows="3" required placeholder="Detalle del evento"></textarea>
      <input id="event-initials" required placeholder="Iniciales del profesional" maxlength="10" />
      <button class="btn" type="submit">Guardar evento</button>
    </form>
    <section class="bitacora-list">
      <h3>Bitácora</h3>
      ${events.length === 0 ? "<p class='muted'>Sin eventos registrados.</p>" : ""}
      ${events
        .map(
          (ev) => `
        <article class="device-card">
          <div class="device-open">
            <strong>${escapeHtml(ev.tipoEvento)}</strong><br>
            <span>${escapeHtml(ev.descripcion)}</span><br>
            <span class="muted">${escapeHtml(ev.iniciales)} | ${escapeHtml(ev.fechaHora)}</span>
          </div>
        </article>`
        )
        .join("")}
    </section>
  `;

  document.getElementById("event-form").addEventListener("submit", (event) => onCreateEvent(event, device.id));
  if (state.isAdmin) {
    document.getElementById("edit-device-inline").addEventListener("click", () => openDeviceDialog(device));
    document.getElementById("new-device-inline").addEventListener("click", () => openDeviceDialog({}));
  }
}

function createAccordion(label, openByDefault) {
  const wrap = document.createElement("div");
  wrap.className = "accordion-level";
  const trigger = document.createElement("button");
  trigger.className = "accordion-trigger";
  trigger.textContent = label;
  const panel = document.createElement("div");
  panel.className = `accordion-panel${openByDefault ? "" : " hidden"}`;
  trigger.addEventListener("click", () => panel.classList.toggle("hidden"));
  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  return { wrap, panel };
}

function groupLocations(locations, devices) {
  const floorsMap = new Map();
  const sortedLocations = [...locations].sort((a, b) => {
    if (a.ordenPiso !== b.ordenPiso) return Number(a.ordenPiso) - Number(b.ordenPiso);
    if (a.piso !== b.piso) return a.piso.localeCompare(b.piso, "es");
    if (a.ordenArea !== b.ordenArea) return Number(a.ordenArea) - Number(b.ordenArea);
    if (a.area !== b.area) return a.area.localeCompare(b.area, "es");
    return a.subarea.localeCompare(b.subarea, "es");
  });

  sortedLocations.forEach((loc) => {
    if (!floorsMap.has(loc.piso)) {
      floorsMap.set(loc.piso, { floorName: loc.piso, areas: new Map() });
    }
    const floor = floorsMap.get(loc.piso);
    if (!floor.areas.has(loc.area)) {
      floor.areas.set(loc.area, { areaName: loc.area, subareas: [] });
    }
    const area = floor.areas.get(loc.area);
    area.subareas.push({
      subareaName: loc.subarea,
      location: loc,
      devices: devices.filter((d) => d.ubicacionId === loc.id),
    });
  });

  return [...floorsMap.values()].map((f) => ({
    floorName: f.floorName,
    areas: [...f.areas.values()],
  }));
}

async function onCreateEvent(event, deviceId) {
  event.preventDefault();
  const tipoEvento = document.getElementById("event-type").value;
  const descripcion = document.getElementById("event-description").value.trim();
  const iniciales = document.getElementById("event-initials").value.trim().toUpperCase();
  if (!tipoEvento || !descripcion || !iniciales) {
    alert("Completa todos los campos.");
    return;
  }
  try {
    await apiCall("addBitacora", { dispositivoId: deviceId, tipoEvento, descripcion, iniciales });
    await loadBootstrap();
    renderDeviceView(deviceId);
  } catch (error) {
    alert(error.message);
  }
}

async function onAdminLogin(event) {
  event.preventDefault();
  const password = el.adminPassword.value;
  try {
    await apiCall("adminLogin", { password });
    state.isAdmin = true;
    state.password = password;
    el.adminDialog.close();
    el.adminPassword.value = "";
    updateAdminUI();
    renderLocations();
    if (state.selectedDeviceId) renderDeviceView(state.selectedDeviceId);
  } catch (error) {
    alert(`Acceso denegado: ${error.message}`);
  }
}

function updateAdminUI() {
  el.adminBtn.textContent = state.isAdmin ? "Salir admin" : "Admin";
}

function openLocationDialog(location = {}) {
  document.getElementById("location-dialog-title").textContent = location.id ? "Editar ubicación" : "Nueva ubicación";
  document.getElementById("location-id").value = location.id || "";
  document.getElementById("location-floor").value = location.piso || location.floor || "";
  document.getElementById("location-area").value = location.area || "";
  document.getElementById("location-subarea").value = location.subarea || "";
  document.getElementById("location-order-floor").value = location.ordenPiso || 0;
  document.getElementById("location-order-area").value = location.ordenArea || 0;
  el.locationDialog.showModal();
}

async function onSaveLocation(event) {
  event.preventDefault();
  try {
    await apiCall("upsertLocation", {
      adminPassword: state.password,
      location: {
        id: document.getElementById("location-id").value || null,
        piso: document.getElementById("location-floor").value.trim(),
        area: document.getElementById("location-area").value.trim(),
        subarea: document.getElementById("location-subarea").value.trim(),
        ordenPiso: Number(document.getElementById("location-order-floor").value || 0),
        ordenArea: Number(document.getElementById("location-order-area").value || 0),
      },
    });
    el.locationDialog.close();
    await loadBootstrap();
  } catch (error) {
    alert(error.message);
  }
}

async function onDeleteLocation() {
  const id = document.getElementById("location-id").value;
  if (!id) {
    alert("No hay ubicación para eliminar.");
    return;
  }
  if (!confirm("¿Eliminar ubicación? Solo si no tiene equipos asociados.")) return;
  try {
    await apiCall("deleteLocation", { adminPassword: state.password, id });
    el.locationDialog.close();
    await loadBootstrap();
  } catch (error) {
    alert(error.message);
  }
}

function openDeviceDialog(device = {}) {
  const options = state.bootstrap?.options || [];
  const models = options.filter((o) => o.categoria === "modelo");
  const conexiones = options.filter((o) => o.categoria === "conexion");
  const locations = state.bootstrap?.locations || [];

  document.getElementById("device-dialog-title").textContent = device.id ? "Editar equipo" : "Nuevo equipo";
  document.getElementById("edit-device-id").value = device.id || "";
  document.getElementById("edit-nombre-real").value = device.nombreReal || "";
  document.getElementById("edit-nombre-practico").value = device.nombrePractico || "";
  document.getElementById("edit-serial").value = device.numeroSerie || "";
  fillSelect("edit-modelo", models.map((m) => m.valor), device.modelo);
  fillSelect("edit-conexion", conexiones.map((c) => c.valor), device.tipoConexion);
  document.getElementById("edit-ip").value = device.direccionIP || "";
  document.getElementById("edit-ubicacion-otro").value = device.ubicacionOtro || "";
  document.getElementById("edit-comentario").value = device.comentarioEstado || "";
  fillSelect(
    "edit-location-id",
    locations.map((l) => ({ value: l.id, label: `${l.piso} / ${l.area} / ${l.subarea}` })),
    device.ubicacionId
  );
  document.getElementById("edit-photo").value = "";
  el.deviceDialog.showModal();
}

function fillSelect(selectId, options, selectedValue) {
  const select = document.getElementById(selectId);
  select.innerHTML = "";
  if (!Array.isArray(options) || options.length === 0) return;
  options.forEach((item) => {
    const option = document.createElement("option");
    if (typeof item === "string") {
      option.value = item;
      option.textContent = item;
    } else {
      option.value = item.value;
      option.textContent = item.label;
    }
    if (option.value === selectedValue) option.selected = true;
    select.appendChild(option);
  });
}

async function onSaveDevice(event) {
  event.preventDefault();
  try {
    const payload = {
      id: document.getElementById("edit-device-id").value || null,
      nombreReal: document.getElementById("edit-nombre-real").value.trim(),
      nombrePractico: document.getElementById("edit-nombre-practico").value.trim(),
      numeroSerie: document.getElementById("edit-serial").value.trim(),
      modelo: document.getElementById("edit-modelo").value,
      tipoConexion: document.getElementById("edit-conexion").value,
      direccionIP: document.getElementById("edit-ip").value.trim(),
      ubicacionOtro: document.getElementById("edit-ubicacion-otro").value.trim(),
      comentarioEstado: document.getElementById("edit-comentario").value.trim(),
      ubicacionId: document.getElementById("edit-location-id").value,
    };

    const upsertResult = await apiCall("upsertDevice", { adminPassword: state.password, device: payload });
    const photoInput = document.getElementById("edit-photo");
    if (photoInput.files?.[0]) {
      const base64 = await fileToBase64(photoInput.files[0]);
      await apiCall("saveDevicePhoto", {
        adminPassword: state.password,
        deviceId: upsertResult.id,
        fileName: photoInput.files[0].name,
        mimeType: photoInput.files[0].type,
        base64Data: base64,
      });
    }
    el.deviceDialog.close();
    await loadBootstrap();
    state.selectedDeviceId = upsertResult.id;
    renderDeviceView(upsertResult.id);
  } catch (error) {
    alert(error.message);
  }
}

async function onDeleteDevice() {
  const id = document.getElementById("edit-device-id").value;
  if (!id) {
    alert("No hay equipo para eliminar.");
    return;
  }
  if (!confirm("¿Eliminar equipo?")) return;
  try {
    await apiCall("deleteDevice", { adminPassword: state.password, id });
    el.deviceDialog.close();
    el.deviceView.classList.add("hidden");
    await loadBootstrap();
  } catch (error) {
    alert(error.message);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function apiCall(action, payload = {}) {
  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Error no controlado");
  return data.data;
}

function isApiConfigured() {
  return API_BASE_URL && !API_BASE_URL.includes("PEGAR_AQUI");
}

function showMessage(message) {
  el.locationsContainer.innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
