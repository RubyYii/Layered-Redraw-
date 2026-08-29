import { requireBrief } from "../src/stimuli.mjs";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function specimenArtworkMarkup(briefId) {
  const artworks = {
    "cooling-credit-2035": `
      <figure class="specimen-visual" data-visual-id="cooling-field" aria-hidden="true">
        <svg viewBox="0 0 300 220" focusable="false">
          <g class="artwork-grid">
            <path d="M24 44H276M24 82H276M24 120H276M24 158H276" />
            <path d="M63 24V188M111 24V188M159 24V188M207 24V188M255 24V188" />
          </g>
          <path class="artwork-wash" d="M35 139C65 91 93 112 123 76C150 44 184 48 206 78C230 111 251 97 270 65V188H35Z" />
          <g class="artwork-ink artwork-blocks">
            <path d="M45 151H84V188H45Z" />
            <path d="M91 129H132V188H91Z" />
            <path d="M139 145H174V188H139Z" />
            <path d="M181 112H224V188H181Z" />
            <path d="M232 137H264V188H232Z" />
          </g>
          <path class="artwork-accent artwork-route" d="M51 136C76 105 99 108 121 83C143 58 169 53 191 71C215 90 229 90 258 52" />
          <g class="artwork-node">
            <circle cx="51" cy="136" r="7" />
            <circle cx="121" cy="83" r="7" />
            <circle cx="191" cy="71" r="7" />
            <circle cx="258" cy="52" r="7" />
          </g>
          <path class="artwork-baseline" d="M31 189H270" />
        </svg>
      </figure>`,
    "carelink-home-2032": `
      <figure class="specimen-visual" data-visual-id="care-rhythm" aria-hidden="true">
        <svg viewBox="0 0 300 220" focusable="false">
          <g class="artwork-grid">
            <path d="M26 48H274M26 92H274M26 136H274M26 180H274" />
            <path d="M74 26V194M126 26V194M178 26V194M230 26V194" />
          </g>
          <path class="artwork-wash" d="M45 178V72L150 31L255 72V178Z" />
          <path class="artwork-ink" d="M45 178V72L150 31L255 72V178M96 178V108H204V178" />
          <g class="artwork-ghost">
            <circle cx="150" cy="124" r="45" />
            <circle cx="150" cy="124" r="66" />
          </g>
          <path class="artwork-accent artwork-pulse" d="M35 126H84L98 103L118 151L137 118L154 126H180L194 88L214 143L230 126H266" />
          <g class="artwork-node">
            <circle cx="98" cy="103" r="7" />
            <circle cx="194" cy="88" r="7" />
            <circle cx="230" cy="126" r="7" />
          </g>
          <path class="artwork-baseline" d="M31 189H270" />
        </svg>
      </figure>`,
    "common-ground-2040": `
      <figure class="specimen-visual" data-visual-id="estuary-contours" aria-hidden="true">
        <svg viewBox="0 0 300 220" focusable="false">
          <g class="artwork-grid">
            <path d="M25 46H275M25 88H275M25 130H275M25 172H275" />
            <path d="M66 25V193M112 25V193M158 25V193M204 25V193M250 25V193" />
          </g>
          <g class="artwork-ink artwork-parcels">
            <path d="M42 72H92V119H42Z" />
            <path d="M104 48H156V106H104Z" />
            <path d="M171 62H220V115H171Z" />
            <path d="M229 42H263V103H229Z" />
          </g>
          <path class="artwork-wash" d="M28 124C64 104 92 147 126 128C159 110 180 144 211 126C235 112 255 118 273 134V189H28Z" />
          <g class="artwork-contours">
            <path d="M29 131C64 111 92 154 126 135C159 117 180 151 211 133C235 119 255 125 272 141" />
            <path d="M29 149C64 129 92 172 126 153C159 135 180 169 211 151C235 137 255 143 272 159" />
            <path d="M29 167C64 147 92 190 126 171C159 153 180 187 211 169C235 155 255 161 272 177" />
          </g>
          <path class="artwork-accent" d="M28 124C64 104 92 147 126 128C159 110 180 144 211 126C235 112 255 118 273 134" />
          <g class="artwork-node">
            <circle cx="92" cy="119" r="7" />
            <circle cx="171" cy="115" r="7" />
            <circle cx="250" cy="103" r="7" />
          </g>
          <path class="artwork-baseline" d="M31 189H270" />
        </svg>
      </figure>`
  };
  return artworks[briefId] || "";
}

export function artefactMarkup(state, { blindLabel = "", showLayers = false, selectedTargets = [] } = {}) {
  const brief = requireBrief(state.briefId);
  const visual = state.visual || brief.visual;
  const fields = brief.fields.map((field) => `
    <div class="specimen-field" data-field-id="${escapeHtml(field.id)}">
      <dt>${escapeHtml(field.label)}</dt>
      <dd>${escapeHtml(state.values[field.id])}</dd>
    </div>`).join("");
  const layerMarker = showLayers
    ? `<div class="brief-strip">${brief.fields.map((field, index) => `
        <span${selectedTargets.includes(field.id) ? ' class="selected-layer"' : ""}>L${index + 1} · ${escapeHtml(field.label)}</span>`).join("")}</div>`
    : "";
  return `
    ${layerMarker}
    <article class="specimen" data-accent="${escapeHtml(visual.accent)}" data-layout="${escapeHtml(visual.layout)}" aria-label="${escapeHtml(brief.shortTitle)}">
      <div class="specimen-head">
        <span class="specimen-code">${escapeHtml(blindLabel || visual.code)}</span>
        <span class="specimen-dot" aria-hidden="true"></span>
      </div>
      <div class="specimen-body">
        <div class="specimen-lead">
          <div class="specimen-title-block">
            <p class="specimen-eyebrow">${escapeHtml(visual.eyebrow)}</p>
            <h2>${escapeHtml(visual.headline)}</h2>
            <div class="metric-box"><strong>${escapeHtml(visual.metric)}</strong><span>${escapeHtml(visual.metricLabel)}</span></div>
          </div>
          ${specimenArtworkMarkup(brief.id)}
        </div>
        <dl class="specimen-fields">${fields}</dl>
      </div>
    </article>`;
}

export function progressMarkup(current, total, label) {
  const safeTotal = Math.max(1, total);
  const percent = Math.round((Math.min(current, safeTotal) / safeTotal) * 100);
  return `
    <div>
      <p class="progress-label">${escapeHtml(label)} · ${current}/${total}</p>
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${current}">
        <span style="width:${percent}%"></span>
      </div>
    </div>`;
}

export function scaleMarkup(name, leftLabel, rightLabel, selected = "") {
  return `
    <div class="scale" role="radiogroup" aria-label="${escapeHtml(leftLabel)} 至 ${escapeHtml(rightLabel)}">
      ${[1, 2, 3, 4, 5].map((value) => `<label title="${value === 1 ? escapeHtml(leftLabel) : value === 5 ? escapeHtml(rightLabel) : value}">
        <input type="radio" name="${escapeHtml(name)}" value="${value}" ${String(selected) === String(value) ? "checked" : ""}>
        <span>${value}</span>
      </label>`).join("")}
    </div>
    <div class="brief-strip" aria-hidden="true"><span>${escapeHtml(leftLabel)}</span><span>${escapeHtml(rightLabel)}</span></div>`;
}

export function radioStackMarkup(name, options, selected = "") {
  return `<div class="radio-stack">${options.map((option, index) => {
    const value = typeof option === "string" ? String(index) : String(option.value);
    const label = typeof option === "string" ? option : option.label;
    return `<label><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${String(selected) === value ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`;
  }).join("")}</div>`;
}

export function valueOf(root, selector) {
  return root.querySelector(selector)?.value?.trim() || "";
}

export function checkedValue(root, name) {
  return root.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

export function setError(root, messages) {
  const target = root.querySelector("[data-errors]");
  if (!target) return;
  target.innerHTML = messages.length
    ? `<ul class="error-list">${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`
    : "";
  if (messages.length) target.scrollIntoView({ behavior: "smooth", block: "center" });
}
