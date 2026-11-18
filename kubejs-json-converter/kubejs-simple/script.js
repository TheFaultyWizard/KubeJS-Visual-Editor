// UI + zip file I/O. The conversion logic lives in converter.js.

// Opens the browser's file picker and calls onFile(file) with the chosen file.
function pickFile(accept, onFile) {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.addEventListener("change", function () {
    if (input.files.length > 0) onFile(input.files[0]);
  });
  input.click();
}

// Lists the real files in a zip (skips folders and hidden files).
async function listZipFiles(file) {
  var zip = await JSZip.loadAsync(file);
  return Object.values(zip.files).filter(function (entry) {
    var base = entry.name.split("/").pop();
    return !entry.dir && base.charAt(0) !== ".";
  });
}

// Asks for a .zip, runs handler(file), and reports errors in an alert.
function importZip(handler) {
  pickFile(".zip", async function (file) {
    try {
      await handler(file);
    } catch (err) {
      console.error(err);
      alert("Couldn't import that zip: " + err.message);
    }
  });
}

// Builds a zip from { "path/in/zip.ext": "text" } and downloads it.
async function downloadZip(zipFileName, files) {
  var zip = new JSZip();
  Object.keys(files).forEach(function (path) {
    zip.file(path, files[path]);            // folders in the path are created automatically
  });
  var blob = await zip.generateAsync({ type: "blob" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = zipFileName;
  link.click();
  URL.revokeObjectURL(url);
}

//buttons

// "To KubeJS": Simple -> KubeJS 
function toKubeJS() {
  console.log("To KubeJS clicked");
  var text = document.getElementById("simple-text").value.trim();
  if (!text) { alert("The Simple box is empty."); return; }
  try {
    document.getElementById("kubejs-text").value = simpleTextToKubeText(text);
  } catch (err) {
    alert(err.message);
  }
}

// "From KubeJS": KubeJS -> Simple 
function fromKubeJS() {
  console.log("From KubeJS clicked");
  var code = document.getElementById("kubejs-text").value.trim();
  if (!code) { alert("The KubeJS box is empty."); return; }
  try {
    var result = kubeTextToSimpleText(code);
    document.getElementById("simple-text").value = result.text;
    if (result.warnings.length > 0) {
      alert("Converted, but some things can't be represented in Simple and were skipped:\n\n- " +
            result.warnings.join("\n- "));
    }
  } catch (err) {
    alert(err.message);
  }
}

// Reads every .js file in the zip 
function uploadKubeJS() {
  console.log("Upload KubeJS clicked");
  importZip(async function (file) {
    var files = await listZipFiles(file);
    var js = files.filter(function (e) { return /\.js$/i.test(e.name); });
    var inServer = js.filter(function (e) { return /(^|\/)server_scripts\//.test(e.name); });
    if (inServer.length > 0) js = inServer;
    if (js.length === 0) js = files.slice(0, 1);          // fallback: first file of any kind
    if (js.length === 0) { alert("That zip doesn't contain any files."); return; }

    var rank = function (e) { return e.name.split("/").pop() === "kubejs-scripts.js" ? 0 : 1; };
    js.sort(function (a, b) { return rank(a) - rank(b) || a.name.localeCompare(b.name); });

    var texts = await Promise.all(js.map(function (e) { return e.async("string"); }));
    document.getElementById("kubejs-text").value = js.length === 1
      ? texts[0]
      : js.map(function (e, i) { return "// ---- " + e.name + " ----\n" + texts[i]; }).join("\n\n");
  });
}

// Reads the first .json file in the zip 
function uploadSimple() {
  console.log("Upload Simple clicked");
  importZip(async function (file) {
    var files = await listZipFiles(file);
    var json = files.filter(function (e) { return /\.json$/i.test(e.name); });
    var pick = json.length > 0 ? json[0] : files[0];
    if (!pick) { alert("That zip doesn't contain any files."); return; }
    document.getElementById("simple-text").value = await pick.async("string");
  });
}

// Zip layout:  kubejs/server_scripts/kubejs-scripts.js   
function exportKubeJS() {
  console.log("Export KubeJS clicked");
  var text = document.getElementById("kubejs-text").value;
  if (!text.trim()) { alert("The KubeJS box is empty."); return; }
  downloadZip("kubejs-scripts.zip", { "kubejs/server_scripts/kubejs-scripts.js": text });
}

function exportSimple() {
  console.log("Export Simple clicked");
  var text = document.getElementById("simple-text").value;
  if (!text.trim()) { alert("The Simple box is empty."); return; }
  downloadZip("simple.zip", { "simple-recipes.json": text });
}



window.addEventListener("DOMContentLoaded", function () {
  document.getElementById("simple-text").value = exampleSimpleText();   // sample of every recipe type

  document.getElementById("btn-to-kubejs").addEventListener("click", toKubeJS);
  document.getElementById("btn-from-kubejs").addEventListener("click", fromKubeJS);
  document.getElementById("btn-upload-kubejs").addEventListener("click", uploadKubeJS);
  document.getElementById("btn-upload-simple").addEventListener("click", uploadSimple);
  document.getElementById("btn-export-kubejs").addEventListener("click", exportKubeJS);
  document.getElementById("btn-export-simple").addEventListener("click", exportSimple);
});
