// =============================================================
// CONFIG — Replace these with your actual values
// =============================================================
const CONFIG = {
  GOOGLE_CLIENT_ID: "892329362970-26qt3og97hqup159prsb82p4luesrgg5.apps.googleusercontent.com",
  SCOPES: "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive",
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
  folderName: $("folder-name"),
  pickFolderBtn: $("pick-folder-btn"),
  clearFolderBtn: $("clear-folder-btn"),
  templateSelect: $("template-select"),
  addTemplateBtn: $("add-template-btn"),
  removeTemplateBtn: $("remove-template-btn"),
  addTemplateForm: $("add-template-form"),
  templateNameInput: $("template-name-input"),
  templateUrlInput: $("template-url-input"),
  browseTemplateBtn: $("browse-template-btn"),
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

  // Try to restore previous session
  if (!restoreSession()) {
    els.signInBtn.style.display = "inline-block";
  }
}

function handleTokenResponse(response) {
  if (response.error) {
    showError("Authentication failed: " + response.error);
    return;
  }
  accessToken = response.access_token;

  // Save token with expiry (default 3600s)
  const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
  sessionStorage.setItem("recipe-token", JSON.stringify({ token: accessToken, expiresAt }));

  // Fetch user info to show name
  fetchUserInfoAndShow();
}

function fetchUserInfoAndShow() {
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

function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("recipe-token"));
    if (saved && saved.token && saved.expiresAt > Date.now()) {
      accessToken = saved.token;
      fetchUserInfoAndShow();
      return true;
    }
  } catch {}
  return false;
}

function signIn() {
  tokenClient.requestAccessToken();
}

function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  sessionStorage.removeItem("recipe-token");
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
// FOLDER PICKER (Google Picker API + localStorage)
// =============================================================
function getSavedFolder() {
  try {
    return JSON.parse(localStorage.getItem("recipe-folder"));
  } catch {
    return null;
  }
}

function saveFolder(folder) {
  localStorage.setItem("recipe-folder", JSON.stringify(folder));
}

function clearSavedFolder() {
  localStorage.removeItem("recipe-folder");
  renderFolder();
}

function renderFolder() {
  const folder = getSavedFolder();
  if (folder) {
    els.folderName.textContent = folder.name;
    els.clearFolderBtn.style.display = "inline-block";
  } else {
    els.folderName.textContent = "My Drive (default)";
    els.clearFolderBtn.style.display = "none";
  }
}

function openFolderPicker() {
  gapi.load("picker", () => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setMimeTypes("application/vnd.google-apps.folder");

    const picker = new google.picker.PickerBuilder()
      .setTitle("Choose a folder for recipes")
      .addView(view)
      .setOAuthToken(accessToken)
      .setCallback(folderPickerCallback)
      .build();
    picker.setVisible(true);
  });
}

function folderPickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    const folder = data.docs[0];
    saveFolder({ id: folder.id, name: folder.name });
    renderFolder();
  }
}

async function moveDocToFolder(fileId) {
  const folder = getSavedFolder();
  if (!folder) return;

  // Get current parents, then move to selected folder
  const file = await gapiRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {});
  const currentParents = (file.parents || []).join(",");

  await gapiRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folder.id}&removeParents=${currentParents}`,
    { method: "PATCH" }
  );
}

// =============================================================
// TEMPLATE PICKER (Google Picker API)
// =============================================================
function openTemplatePicker() {
  gapi.load("picker", () => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCUMENTS)
      .setMimeTypes("application/vnd.google-apps.document");

    const picker = new google.picker.PickerBuilder()
      .setTitle("Choose a template document")
      .addView(view)
      .setOAuthToken(accessToken)
      .setCallback(templatePickerCallback)
      .build();
    picker.setVisible(true);
  });
}

function templatePickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    const doc = data.docs[0];
    els.templateUrlInput.value = `https://docs.google.com/document/d/${doc.id}/edit`;
    if (!els.templateNameInput.value.trim()) {
      els.templateNameInput.value = doc.name;
    }
  }
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
  // Restore last used template
  const last = localStorage.getItem("recipe-last-template");
  if (last && els.templateSelect.querySelector(`option[value="${last}"]`)) {
    els.templateSelect.value = last;
  }
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

// Recursively extract all text from a Docs API content array (handles tables)
function extractAllText(content) {
  let text = "";
  for (const el of content) {
    if (el.paragraph) {
      for (const pe of el.paragraph.elements || []) {
        if (pe.textRun?.content) text += pe.textRun.content;
      }
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          text += extractAllText(cell.content || []);
        }
      }
    }
  }
  return text;
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
async function gapiRequest(url, options = {}) {
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
  const doc = await gapiRequest("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    body: JSON.stringify({ title: data.title || data.recipeName || "Untitled Recipe" }),
  });
  const docId = doc.documentId;

  // 2. Build the document content
  // We insert text from end to start so indices don't shift.
  // Build sections in order, then reverse for insertion.
  const sections = [];

  // Title is already the document title, but also add it as a heading
  sections.push({ text: (data.title || data.recipeName || "Untitled Recipe") + "\n", style: "HEADING_1" });

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
    const rawIngredients = Array.isArray(data.ingredients) ? data.ingredients : data.ingredients.split("\n");
    const processedLines = [];
    const ingredientHeadings = [];
    for (const item of rawIngredients) {
      const line = item.trim();
      if (!line || line === "**BLANK**") {
        processedLines.push("");
      } else if (line.startsWith("**HEADING:") && line.endsWith("**")) {
        const headingText = line.slice(10, -2);
        processedLines.push(headingText);
        ingredientHeadings.push(headingText);
      } else {
        processedLines.push(line);
      }
    }
    sections.push({ text: processedLines.join("\n") + "\n\n", style: "NORMAL_TEXT", ingredientHeadings });
  }

  // Instructions
  if (data.instructions) {
    sections.push({ text: "Instructions\n", style: "HEADING_2" });
    const rawInstructions = Array.isArray(data.instructions) ? data.instructions.join("\n") : data.instructions;
    const steps = rawInstructions
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

    // Apply bold to ingredient section headings
    if (section.ingredientHeadings && section.ingredientHeadings.length > 0) {
      const lines = section.text.split("\n");
      let lineOffset = 0;
      for (const line of lines) {
        if (line && section.ingredientHeadings.includes(line)) {
          requests.push({
            updateTextStyle: {
              range: {
                startIndex: startIndex + lineOffset,
                endIndex: startIndex + lineOffset + line.length,
              },
              textStyle: { bold: true },
              fields: "bold",
            },
          });
        }
        lineOffset += line.length + 1;
      }
    }

    index = endIndex;
  }

  // 4. Send batch update
  if (requests.length > 0) {
    await gapiRequest(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
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
  templateDocId = templateDocId.replace(/[^a-zA-Z0-9_-]/g, "");

  // 1. Copy the template via Drive API
  const copy = await gapiRequest(
    `https://www.googleapis.com/drive/v3/files/${templateDocId}/copy`,
    {
      method: "POST",
      body: JSON.stringify({ name: data.title || data.recipeName || "Untitled Recipe" }),
    }
  );
  const docId = copy.id;

  // 2. Build replaceAllText requests for each tag
  const replaceRequests = [];
  const listTags = ["method", "instructions", "directions", "steps"];
  const ingredientHeadings = []; // heading texts to bold after replacement

  for (const [tag, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === "") continue;
    let text;

    if (tag === "ingredients" && Array.isArray(value)) {
      const processedLines = [];
      for (const item of value) {
        const line = item.trim();
        if (!line || line === "**BLANK**") {
          processedLines.push("");
        } else if (line.startsWith("**HEADING:") && line.endsWith("**")) {
          const headingText = line.slice(10, -2);
          processedLines.push(headingText);
          ingredientHeadings.push(headingText);
        } else {
          processedLines.push(line);
        }
      }
      text = processedLines.join("\n");
    } else {
      text = Array.isArray(value) ? value.join("\n") : String(value);
      if (listTags.includes(tag)) {
        text = text.split("\n").map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean).join("\n");
      }
    }

    replaceRequests.push({
      replaceAllText: {
        containsText: { text: `{{${tag}}}`, matchCase: false },
        replaceText: text,
      },
    });
  }

  // 3. Send replaceAllText batch
  if (replaceRequests.length > 0) {
    await gapiRequest(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: replaceRequests }),
    });
  }

  // 4. Re-read the doc to find where list content landed, then apply formatting
  const updatedDoc = await gapiRequest(`https://docs.googleapis.com/v1/documents/${docId}`);
  const formatRequests = [];
  const allContent = updatedDoc.body?.content || [];

  // Apply numbered list formatting to instruction-type tags
  for (const tag of listTags) {
    const value = data[tag];
    if (!value) continue;
    let text = Array.isArray(value) ? value.join("\n") : String(value);
    text = text.split("\n").map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean).join("\n");

    const startIndex = findTextIndex(allContent, text);
    if (startIndex === -1) continue;

    const lines = text.split("\n").filter(Boolean);
    let lineStart = startIndex;
    for (const line of lines) {
      formatRequests.push({
        createParagraphBullets: {
          range: { startIndex: lineStart, endIndex: lineStart + line.length },
          bulletPreset: "NUMBERED_DECIMAL_ALPHA_ROMAN",
        },
      });
      lineStart += line.length + 1;
    }
  }

  // Apply bold to ingredient section headings
  for (const headingText of ingredientHeadings) {
    const idx = findTextIndex(allContent, headingText);
    if (idx === -1) continue;
    formatRequests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + headingText.length },
        textStyle: { bold: true },
        fields: "bold",
      },
    });
  }

  if (formatRequests.length > 0) {
    await gapiRequest(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: formatRequests }),
    });
  }

  return `https://docs.google.com/document/d/${docId}/edit`;
}

// Find the start index of a text string in doc content
function findTextIndex(content, searchText) {
  const firstLine = searchText.split("\n")[0];
  for (const el of content) {
    if (el.paragraph) {
      for (const pe of el.paragraph.elements || []) {
        if (pe.textRun?.content?.includes(firstLine)) {
          return pe.startIndex + pe.textRun.content.indexOf(firstLine);
        }
      }
    }
    if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          const result = findTextIndex(cell.content || [], searchText);
          if (result !== -1) return result;
        }
      }
    }
  }
  return -1;
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
  localStorage.setItem("recipe-last-template", templateValue);
  let templateDocId = null;
  let tags = null;

  // If custom template, we need to discover tags first
  if (templateValue !== "default") {
    const templates = getTemplates();
    const idx = parseInt(templateValue, 10);
    templateDocId = (templates[idx]?.docId || "").replace(/[^a-zA-Z0-9_-]/g, "");

    if (templateDocId) {
      showStatus("Reading template...");
      try {
        const doc = await gapiRequest(`https://docs.googleapis.com/v1/documents/${templateDocId}`);
        const fullText = extractAllText(doc.body?.content || []);

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

    // Move to saved folder if one is selected
    if (getSavedFolder()) {
      showStatus("Moving to folder...");
      const docIdMatch = docUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
      if (docIdMatch) {
        await moveDocToFolder(docIdMatch[1]);
      }
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

  // Folder picker
  els.pickFolderBtn.addEventListener("click", openFolderPicker);
  els.clearFolderBtn.addEventListener("click", clearSavedFolder);
  renderFolder();

  // Templates
  els.templateSelect.addEventListener("change", updateRemoveButton);
  els.addTemplateBtn.addEventListener("click", showAddTemplateForm);
  els.cancelTemplateBtn.addEventListener("click", hideAddTemplateForm);
  els.browseTemplateBtn.addEventListener("click", openTemplatePicker);
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
