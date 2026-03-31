// =============================================================
// CONFIG — Replace these with your actual values
// =============================================================
const CONFIG = {
  GOOGLE_CLIENT_ID: "892329362970-26qt3og97hqup159prsb82p4luesrgg5.apps.googleusercontent.com",
  SCOPES: "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file",
};

// =============================================================
// STATE
// =============================================================
let accessToken = null;
let tokenClient = null;

// =============================================================
// DOM ELEMENTS
// =============================================================
const $ = (id) => document.getElementById(id);

const els = {
  signInBtn: $("sign-in-btn"),
  signOutBtn: $("sign-out-btn"),
  userInfo: $("user-info"),
  userName: $("user-name"),
  signedOutMsg: $("signed-out-msg"),
  recipeSection: $("recipe-section"),
  recipeInput: $("recipe-input"),
  templateSelect: $("template-select"),
  addTemplateBtn: $("add-template-btn"),
  removeTemplateBtn: $("remove-template-btn"),
  addTemplateForm: $("add-template-form"),
  templateNameInput: $("template-name-input"),
  templateUrlInput: $("template-url-input"),
  saveTemplateBtn: $("save-template-btn"),
  cancelTemplateBtn: $("cancel-template-btn"),
  createBtn: $("create-btn"),
  statusSection: $("status-section"),
  statusText: $("status-text"),
  resultSection: $("result-section"),
  warnings: $("warnings"),
  docLink: $("doc-link"),
  newRecipeBtn: $("new-recipe-btn"),
  errorSection: $("error-section"),
  errorText: $("error-text"),
  errorDismissBtn: $("error-dismiss-btn"),
};

// =============================================================
// GOOGLE AUTH
// =============================================================
function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: handleTokenResponse,
  });
  els.signInBtn.style.display = "inline-block";
}

function handleTokenResponse(response) {
  if (response.error) {
    showError("Authentication failed: " + response.error);
    return;
  }
  accessToken = response.access_token;

  // Fetch user info to show name
  fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
    .then((r) => r.json())
    .then((info) => {
      els.userName.textContent = info.name || info.email;
      showSignedIn();
    })
    .catch(() => {
      els.userName.textContent = "Signed In";
      showSignedIn();
    });
}

function signIn() {
  tokenClient.requestAccessToken();
}

function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  showSignedOut();
}

function showSignedIn() {
  els.signInBtn.style.display = "none";
  els.userInfo.style.display = "flex";
  els.signedOutMsg.style.display = "none";
  els.recipeSection.style.display = "block";
}

function showSignedOut() {
  els.signInBtn.style.display = "inline-block";
  els.userInfo.style.display = "none";
  els.signedOutMsg.style.display = "block";
  els.recipeSection.style.display = "none";
  els.statusSection.style.display = "none";
  els.resultSection.style.display = "none";
  els.errorSection.style.display = "none";
}

// =============================================================
// TEMPLATE MANAGEMENT (localStorage)
// =============================================================
function getTemplates() {
  try {
    return JSON.parse(localStorage.getItem("recipe-templates") || "[]");
  } catch {
    return [];
  }
}

function saveTemplates(templates) {
  localStorage.setItem("recipe-templates", JSON.stringify(templates));
}

function renderTemplates() {
  const templates = getTemplates();
  // Clear all options except default
  els.templateSelect.innerHTML = '<option value="default">Default Template</option>';
  templates.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = t.name;
    els.templateSelect.appendChild(opt);
  });
  updateRemoveButton();
}

function updateRemoveButton() {
  els.removeTemplateBtn.style.display =
    els.templateSelect.value !== "default" ? "inline-block" : "none";
}

function extractDocId(url) {
  // Supports URLs like:
  // https://docs.google.com/document/d/DOC_ID/edit
  // https://docs.google.com/document/d/DOC_ID
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function showAddTemplateForm() {
  els.addTemplateForm.style.display = "block";
  els.templateNameInput.value = "";
  els.templateUrlInput.value = "";
  els.templateNameInput.focus();
}

function hideAddTemplateForm() {
  els.addTemplateForm.style.display = "none";
}

function addTemplate() {
  const name = els.templateNameInput.value.trim();
  const url = els.templateUrlInput.value.trim();
  if (!name) {
    alert("Please enter a template name.");
    return;
  }
  const docId = extractDocId(url);
  if (!docId) {
    alert("Invalid Google Doc URL. It should look like:\nhttps://docs.google.com/document/d/.../edit");
    return;
  }
  const templates = getTemplates();
  templates.push({ name, docId });
  saveTemplates(templates);
  renderTemplates();
  // Select the newly added template
  els.templateSelect.value = String(templates.length - 1);
  updateRemoveButton();
  hideAddTemplateForm();
}

function removeTemplate() {
  const idx = parseInt(els.templateSelect.value, 10);
  if (isNaN(idx)) return;
  const templates = getTemplates();
  templates.splice(idx, 1);
  saveTemplates(templates);
  renderTemplates();
  els.templateSelect.value = "default";
  updateRemoveButton();
}

// =============================================================
// UI STATE HELPERS
// =============================================================
function showStatus(text) {
  els.recipeSection.style.display = "none";
  els.resultSection.style.display = "none";
  els.errorSection.style.display = "none";
  els.statusSection.style.display = "block";
  els.statusText.textContent = text;
}

function showResult(docUrl, warnings) {
  els.statusSection.style.display = "none";
  els.resultSection.style.display = "block";
  els.docLink.href = docUrl;

  els.warnings.innerHTML = "";
  if (warnings && warnings.length > 0) {
    warnings.forEach((w) => {
      const div = document.createElement("div");
      div.className = "warning";
      div.textContent = w;
      els.warnings.appendChild(div);
    });
  }
}

function showError(message) {
  els.statusSection.style.display = "none";
  els.errorSection.style.display = "block";
  els.errorText.textContent = message;
}

function resetToInput() {
  els.statusSection.style.display = "none";
  els.resultSection.style.display = "none";
  els.errorSection.style.display = "none";
  els.recipeSection.style.display = "block";
}

// =============================================================
// GOOGLE DOCS API HELPERS
// =============================================================
async function gapi(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API error (${res.status}): ${text}`);
  }
  return res.json();
}

// =============================================================
// DEFAULT TEMPLATE: Create doc with rich formatting
// =============================================================
async function createDocFromDefault(data) {
  // 1. Create empty doc
  const doc = await gapi("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    body: JSON.stringify({ title: data.title || "Untitled Recipe" }),
  });
  const docId = doc.documentId;

  // 2. Build the document content
  // We insert text from end to start so indices don't shift.
  // Build sections in order, then reverse for insertion.
  const sections = [];

  // Title is already the document title, but also add it as a heading
  sections.push({ text: (data.title || "Untitled Recipe") + "\n", style: "HEADING_1" });

  // Metadata line
  const metaParts = [];
  if (data.prep_time) metaParts.push(`Prep Time: ${data.prep_time}`);
  if (data.cook_time) metaParts.push(`Cook Time: ${data.cook_time}`);
  if (data.total_time) metaParts.push(`Total Time: ${data.total_time}`);
  if (data.servings) metaParts.push(`Servings: ${data.servings}`);
  if (metaParts.length > 0) {
    sections.push({ text: metaParts.join("  |  ") + "\n\n", style: "NORMAL_TEXT", bold: false });
  }

  // Ingredients
  if (data.ingredients) {
    sections.push({ text: "Ingredients\n", style: "HEADING_2" });
    const ingredientLines = data.ingredients
      .split("\n")
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
    sections.push({ text: ingredientLines.join("\n") + "\n\n", style: "NORMAL_TEXT", bullets: true });
  }

  // Instructions
  if (data.instructions) {
    sections.push({ text: "Instructions\n", style: "HEADING_2" });
    const steps = data.instructions
      .split("\n")
      .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(Boolean);
    sections.push({ text: steps.join("\n") + "\n\n", style: "NORMAL_TEXT", numbered: true });
  }

  // Notes
  if (data.notes) {
    sections.push({ text: "Notes\n", style: "HEADING_2" });
    sections.push({ text: data.notes + "\n", style: "NORMAL_TEXT" });
  }

  // 3. Build batch update requests
  const requests = [];
  let index = 1; // Docs API starts at index 1

  for (const section of sections) {
    const startIndex = index;
    const endIndex = startIndex + section.text.length;

    // Insert text
    requests.push({
      insertText: {
        location: { index: startIndex },
        text: section.text,
      },
    });

    // Apply paragraph style
    if (section.style === "HEADING_1" || section.style === "HEADING_2") {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex, endIndex: endIndex - 1 },
          paragraphStyle: { namedStyleType: section.style },
          fields: "namedStyleType",
        },
      });
    }

    // Apply bold to metadata
    if (section.bold === false) {
      // Find the labels and bold them
      const labelRegex = /(Prep Time:|Cook Time:|Total Time:|Servings:)/g;
      let match;
      while ((match = labelRegex.exec(section.text)) !== null) {
        requests.push({
          updateTextStyle: {
            range: {
              startIndex: startIndex + match.index,
              endIndex: startIndex + match.index + match[1].length,
            },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      }
    }

    // Apply bullet list
    if (section.bullets) {
      const lines = section.text.split("\n").filter(Boolean);
      let lineStart = startIndex;
      for (const line of lines) {
        requests.push({
          createParagraphBullets: {
            range: { startIndex: lineStart, endIndex: lineStart + line.length },
            bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
          },
        });
        lineStart += line.length + 1; // +1 for newline
      }
    }

    // Apply numbered list
    if (section.numbered) {
      const lines = section.text.split("\n").filter(Boolean);
      let lineStart = startIndex;
      for (const line of lines) {
        requests.push({
          createParagraphBullets: {
            range: { startIndex: lineStart, endIndex: lineStart + line.length },
            bulletPreset: "NUMBERED_DECIMAL_ALPHA_ROMAN",
          },
        });
        lineStart += line.length + 1;
      }
    }

    index = endIndex;
  }

  // 4. Send batch update
  if (requests.length > 0) {
    await gapi(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  return `https://docs.google.com/document/d/${docId}/edit`;
}

// =============================================================
// CUSTOM TEMPLATE: Copy template doc and replace tags
// =============================================================
async function createDocFromTemplate(templateDocId, data) {
  // 1. Copy the template
  const copy = await gapi(
    `https://www.googleapis.com/drive/v3/files/${templateDocId}/copy`,
    {
      method: "POST",
      body: JSON.stringify({ name: data.title || "Untitled Recipe" }),
    }
  );
  const docId = copy.id;

  // 2. Read the copied doc to discover tags
  const doc = await gapi(`https://docs.googleapis.com/v1/documents/${docId}`);
  const body = doc.body?.content || [];
  const fullText = body
    .map((el) =>
      el.paragraph?.elements?.map((e) => e.textRun?.content || "").join("") || ""
    )
    .join("");

  // Find all {{tag}} patterns
  const tagRegex = /\{\{(\w+)\}\}/g;
  const foundTags = new Set();
  let match;
  while ((match = tagRegex.exec(fullText)) !== null) {
    foundTags.add(match[1]);
  }

  // 3. Build replaceAllText requests
  const requests = [];
  for (const tag of foundTags) {
    const value = data[tag] || "";
    requests.push({
      replaceAllText: {
        containsText: { text: `{{${tag}}}`, matchCase: true },
        replaceText: value,
      },
    });
  }

  // 4. Send batch update
  if (requests.length > 0) {
    await gapi(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  return `https://docs.google.com/document/d/${docId}/edit`;
}

// =============================================================
// MAIN FLOW: Parse recipe & create doc
// =============================================================
async function createRecipe() {
  const recipeText = els.recipeInput.value.trim();
  if (!recipeText) {
    alert("Please paste a recipe first.");
    return;
  }

  const templateValue = els.templateSelect.value;
  let templateDocId = null;
  let tags = null;

  // If custom template, we need to discover tags first
  if (templateValue !== "default") {
    const templates = getTemplates();
    const idx = parseInt(templateValue, 10);
    templateDocId = templates[idx]?.docId;

    if (templateDocId) {
      showStatus("Reading template...");
      try {
        const doc = await gapi(`https://docs.googleapis.com/v1/documents/${templateDocId}`);
        const body = doc.body?.content || [];
        const fullText = body
          .map((el) =>
            el.paragraph?.elements?.map((e) => e.textRun?.content || "").join("") || ""
          )
          .join("");

        const tagRegex = /\{\{(\w+)\}\}/g;
        const foundTags = [];
        let match;
        while ((match = tagRegex.exec(fullText)) !== null) {
          foundTags.push(match[1]);
        }
        if (foundTags.length > 0) {
          tags = foundTags;
        }
      } catch (err) {
        showError("Could not read template: " + err.message);
        return;
      }
    }
  }

  // Step 1: Parse with Gemini
  showStatus("Sending recipe to AI...");
  let parseResult;
  try {
    const res = await fetch("/api/parse-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeText, tags }),
    });
    parseResult = await res.json();
    if (!res.ok) {
      throw new Error(parseResult.error || "Failed to parse recipe");
    }
  } catch (err) {
    showError("Recipe parsing failed: " + err.message);
    return;
  }

  const data = parseResult.data;
  const warnings = parseResult.warnings || [];

  // Step 2: Create Google Doc
  showStatus("Creating Google Doc...");
  try {
    let docUrl;
    if (templateDocId) {
      docUrl = await createDocFromTemplate(templateDocId, data);
    } else {
      docUrl = await createDocFromDefault(data);
    }
    showResult(docUrl, warnings);
  } catch (err) {
    showError("Failed to create Google Doc: " + err.message);
  }
}

// =============================================================
// EVENT LISTENERS
// =============================================================
function init() {
  // Auth
  els.signInBtn.addEventListener("click", signIn);
  els.signOutBtn.addEventListener("click", signOut);

  // Templates
  els.templateSelect.addEventListener("change", updateRemoveButton);
  els.addTemplateBtn.addEventListener("click", showAddTemplateForm);
  els.cancelTemplateBtn.addEventListener("click", hideAddTemplateForm);
  els.saveTemplateBtn.addEventListener("click", addTemplate);
  els.removeTemplateBtn.addEventListener("click", removeTemplate);

  // Recipe
  els.createBtn.addEventListener("click", createRecipe);
  els.newRecipeBtn.addEventListener("click", resetToInput);
  els.errorDismissBtn.addEventListener("click", resetToInput);

  // Load saved templates
  renderTemplates();

  // Wait for Google Identity Services to load
  const checkGsi = setInterval(() => {
    if (typeof google !== "undefined" && google.accounts) {
      clearInterval(checkGsi);
      initAuth();
    }
  }, 100);
}

document.addEventListener("DOMContentLoaded", init);
