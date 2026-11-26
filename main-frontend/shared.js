// stuff every page uses: the database and the left sidebar buttons
// needs dexie, jszip and converter.js loaded first

// same database as kubejs-simple/backend.js
// row 1 = { kubejs, simple } simple is the whole recipe json as text
// row 2 = { draft } the recipe currently being built
const db = new Dexie("StorageDatabase");
db.version(1).stores({ values: "id, kubejs, simple" });

function makeEmptyDoc() {
    return { format: "simple-recipes", version: 1, recipes: [] };
}

// gives back the simple doc as an object
// gives back null if the saved text is broken so we dont overwrite it
async function getSimpleDoc() {
    const row = await db.values.get(1);
    if (!row || !row.simple || row.simple.trim() === "") {
        return makeEmptyDoc();
    }

    try {
        const data = JSON.parse(row.simple);
        if (Array.isArray(data)) {
            return { format: "simple-recipes", version: 1, recipes: data };
        }
        if (data && Array.isArray(data.recipes)) {
            return data;
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function saveSimpleDoc(doc) {
    const oldRow = (await db.values.get(1)) || {};
    let text;
    if (typeof formatSimple === "function") {
        text = formatSimple(doc);
    } else {
        text = JSON.stringify(doc, null, 2);
    }
    await db.values.put({ ...oldRow, id: 1, simple: text });
}

async function getSimpleText() {
    const row = await db.values.get(1);
    if (row && row.simple) {
        return row.simple;
    }
    return "";
}

async function setSimpleText(text) {
    const oldRow = (await db.values.get(1)) || {};
    await db.values.put({ ...oldRow, id: 1, simple: text });
}

async function getDraft() {
    const row = await db.values.get(2);
    if (row) {
        return row.draft;
    }
    return null;
}

async function saveDraft(draft) {
    await db.values.put({ id: 2, draft: draft });
}

// file stuff

function pickFile(accept, onFile) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", function () {
        if (input.files.length > 0) {
            onFile(input.files[0]);
        }
    });
    input.click();
}

async function downloadZip(zipName, files) {
    const zip = new JSZip();
    Object.keys(files).forEach(function (path) {
        zip.file(path, files[path]);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = zipName;
    link.click();
    URL.revokeObjectURL(url);
}

// left sidebar buttons

// reads the js files in a zip, converts them to simple json and saves it
function uploadScripts() {
    pickFile(".zip", async function (file) {
        try {
            const zip = await JSZip.loadAsync(file);

            // skip folders and hidden files
            const entries = Object.values(zip.files).filter(function (entry) {
                const fileName = entry.name.split("/").pop();
                return !entry.dir && fileName.charAt(0) !== ".";
            });

            let scripts = entries.filter(function (entry) {
                return /\.js$/i.test(entry.name);
            });

            // prefer server_scripts if there is one
            const serverScripts = scripts.filter(function (entry) {
                return /(^|\/)server_scripts\//.test(entry.name);
            });
            if (serverScripts.length > 0) {
                scripts = serverScripts;
            }

            if (scripts.length === 0) {
                alert("That zip doesn't contain any .js scripts.");
                return;
            }

            const texts = await Promise.all(scripts.map(function (entry) {
                return entry.async("string");
            }));

            let code = texts[0];
            if (scripts.length > 1) {
                code = scripts.map(function (entry, index) {
                    return "// ---- " + entry.name + " ----\n" + texts[index];
                }).join("\n\n");
            }

            const result = kubeTextToSimpleText(code);
            await setSimpleText(result.text);

            // the recipe being built isnt in the same spot anymore
            const draft = await getDraft();
            if (draft) {
                draft.editingIndex = null;
                await saveDraft(draft);
            }

            if (result.warnings.length > 0) {
                alert("Imported, but some things were skipped:\n\n- " + result.warnings.join("\n- "));
            } else {
                alert("Scripts imported.");
            }
        } catch (error) {
            console.error(error);
            alert("Couldn't import that zip: " + error.message);
        }
    });
}

// turns the saved simple json into a kubejs script and downloads it
async function downloadScripts() {
    try {
        const text = await getSimpleText();
        if (text.trim() === "") {
            alert("There are no recipes to download yet.");
            return;
        }
        const script = simpleTextToKubeText(text);
        await downloadZip("kubejs-scripts.zip", {
            "kubejs/server_scripts/kubejs-scripts.js": script
        });
    } catch (error) {
        console.error(error);
        alert("Couldn't build the scripts: " + error.message);
    }
}

window.addEventListener("DOMContentLoaded", function () {
    document.getElementById("btn-upload-scripts").addEventListener("click", uploadScripts);
    document.getElementById("btn-download-scripts").addEventListener("click", downloadScripts);
});
