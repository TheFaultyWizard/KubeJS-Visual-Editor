// recipe creation page, drag items into the slots with interact.js
// needs interact.js, dexie, converter.js, shared.js, items-hook.js, recipe-types.js, recipe-model.js

// slot names: "0" to "8", "template", "base", "addition", "input" and "out"
const state = {
    recipeType: "shaped",
    slots: {},
    outputCount: 1,
    xp: "",
    cookingTime: "",
    customText: "",
    recipeId: null,
    editingIndex: null
};

const typeSelect = document.getElementById("recipe-type");
const shapelessLabel = document.getElementById("shapeless-label");
const shapelessBox = document.getElementById("shapeless-toggle");
const inputArea = document.getElementById("input-area");
const craftLayout = document.getElementById("craft-layout");
const extraFields = document.getElementById("extra-fields");
const xpInput = document.getElementById("xp-input");
const cookingTimeInput = document.getElementById("cooking-time-input");
const customArea = document.getElementById("custom-area");
const customInput = document.getElementById("custom-json");
const countInput = document.getElementById("output-count");
const saveButton = document.getElementById("save-recipe");
const saveStatus = document.getElementById("save-status");
const paletteSection = document.getElementById("palette-section");
const paletteGrid = document.getElementById("palette-grid");
const paletteStatus = document.getElementById("palette-status");
const paletteSearch = document.getElementById("palette-search");
const paletteType = document.getElementById("palette-type");
const tooltip = document.getElementById("item-tooltip");

let ghost = null;
let isDragging = false;
let draftQueue = Promise.resolve();

function currentLayout() {
    return recipeTypes[state.recipeType].layout;
}

function getSlotElement(slotName) {
    if (slotName === "out") {
        return document.querySelector(".output-cell");
    }
    return document.querySelector('.grid-cell[data-slot="' + slotName + '"]');
}

function getSlot(slotName) {
    return state.slots[slotName] || null;
}

function setSlot(slotName, itemId) {
    state.slots[slotName] = itemId;
}

// the draft is saved after every change, saves are queued so they stay in order
function storeDraft() {
    const snapshot = JSON.parse(JSON.stringify(state));
    snapshot.recipe = buildRawRecipe(state);

    draftQueue = draftQueue
        .then(function () {
            return saveDraft(snapshot);
        })
        .catch(function (error) {
            console.error("couldn't save the draft:", error);
        });
    return draftQueue;
}

// drawing

function drawSlot(slotName) {
    const cell = getSlotElement(slotName);
    if (!cell) {
        return;
    }

    const oldItem = cell.querySelector(".slot-item");
    if (oldItem) {
        oldItem.remove();
    }

    const itemId = getSlot(slotName);
    if (!itemId) {
        return;
    }

    const holder = document.createElement("div");
    holder.className = "draggable-item slot-item";
    holder.dataset.item = itemId;
    holder.dataset.slot = slotName;

    if (itemId.charAt(0) === "#") {
        const tagLabel = document.createElement("span");
        tagLabel.className = "tag-label";
        tagLabel.textContent = itemId.slice(1).split(":").pop();
        holder.appendChild(tagLabel);
    } else {
        holder.appendChild(ItemSprites.createSprite(itemId));
    }
    cell.appendChild(holder);
}

function drawAllSlots() {
    layoutSlots[currentLayout()].forEach(drawSlot);
    drawSlot("out");
}

// rebuilds the input cells and shows the parts that the recipe type needs
function drawRecipeType() {
    const layout = currentLayout();
    const isCustom = layout === "custom";

    inputArea.innerHTML = "";
    inputArea.className = "input-grid " + layout;
    layoutSlots[layout].forEach(function (slotName) {
        const cell = document.createElement("div");
        cell.className = "grid-cell";
        cell.dataset.slot = slotName;
        if (layout === "smithing") {
            cell.dataset.label = slotName;
        }
        inputArea.appendChild(cell);
    });

    const isCrafting = layout === "grid";
    typeSelect.value = isCrafting ? "crafting" : state.recipeType;
    shapelessLabel.hidden = !isCrafting;
    shapelessBox.checked = state.recipeType === "shapeless";

    craftLayout.hidden = isCustom;
    customArea.hidden = !isCustom;
    paletteSection.hidden = isCustom;
    extraFields.hidden = !recipeTypes[state.recipeType].cooking;

    countInput.value = state.outputCount;
    xpInput.value = state.xp;
    cookingTimeInput.value = state.cookingTime;
    customInput.value = state.customText;
    saveButton.textContent = state.editingIndex === null ? "Save Recipe" : "Save Changes";

    drawAllSlots();
    refreshPalette();
}

function slotsChanged(slotNames) {
    slotNames.forEach(drawSlot);
    storeDraft();
}

// controls

typeSelect.addEventListener("change", function () {
    if (typeSelect.value === "crafting") {
        state.recipeType = shapelessBox.checked ? "shapeless" : "shaped";
    } else {
        state.recipeType = typeSelect.value;
    }
    saveStatus.textContent = "";
    drawRecipeType();
    storeDraft();
});

shapelessBox.addEventListener("change", function () {
    state.recipeType = shapelessBox.checked ? "shapeless" : "shaped";
    refreshPalette();
    storeDraft();
});

function readCount() {
    let count = parseInt(countInput.value, 10);
    if (isNaN(count)) {
        count = 1;
    }
    return Math.min(64, Math.max(1, count));
}

countInput.addEventListener("input", function () {
    if (countInput.value === "") {
        return;
    }
    state.outputCount = readCount();
    storeDraft();
});

countInput.addEventListener("change", function () {
    state.outputCount = readCount();
    countInput.value = state.outputCount;
    storeDraft();
});

xpInput.addEventListener("input", function () {
    state.xp = xpInput.value;
    storeDraft();
});

cookingTimeInput.addEventListener("input", function () {
    state.cookingTime = cookingTimeInput.value;
    storeDraft();
});

customInput.addEventListener("input", function () {
    state.customText = customInput.value;
    storeDraft();
});

// saving the recipe to my recipes

async function saveRecipe() {
    const result = buildRecipe(state);
    if (result.error) {
        saveStatus.textContent = result.error;
        return;
    }

    try {
        const doc = await getSimpleDoc();
        if (doc === null) {
            saveStatus.textContent = "the saved recipes are broken, can't save";
            return;
        }

        const wasEditing = state.editingIndex !== null && doc.recipes[state.editingIndex];
        if (wasEditing) {
            doc.recipes[state.editingIndex] = result.recipe;
        } else {
            doc.recipes.push(result.recipe);
        }
        await saveSimpleDoc(doc);

        state.slots = {};
        state.outputCount = 1;
        state.xp = "";
        state.cookingTime = "";
        state.customText = "";
        state.recipeId = null;
        state.editingIndex = null;
        await storeDraft();

        if (wasEditing) {
            location.href = "my-recipes.html";
            return;
        }
        drawRecipeType();
        saveStatus.textContent = "saved to My Recipes";
    } catch (error) {
        console.error(error);
        saveStatus.textContent = "couldn't save: " + error.message;
    }
}

saveButton.addEventListener("click", saveRecipe);

// tooltip with the display name

document.addEventListener("mousemove", function (event) {
    const hovered = event.target.closest ? event.target.closest(".draggable-item") : null;

    if (!hovered || isDragging) {
        tooltip.style.display = "none";
        return;
    }

    tooltip.textContent = ItemSprites.nameOf(hovered.dataset.item);
    tooltip.style.display = "block";
    tooltip.style.left = (event.clientX + 14) + "px";
    tooltip.style.top = (event.clientY + 18) + "px";
});

document.addEventListener("mouseleave", function () {
    tooltip.style.display = "none";
});

// dragging with interact.js

function makeGhost(itemId) {
    if (itemId.charAt(0) === "#") {
        const tagGhost = document.createElement("div");
        tagGhost.className = "drag-ghost tag-ghost";
        tagGhost.textContent = itemId;
        return tagGhost;
    }
    const spriteGhost = document.createElement("img");
    spriteGhost.className = "drag-ghost";
    spriteGhost.src = ItemSprites.spriteUrl(itemId);
    return spriteGhost;
}

function moveGhost(event) {
    if (!ghost) {
        return;
    }
    ghost.style.left = (event.clientX - 16) + "px";
    ghost.style.top = (event.clientY - 16) + "px";
}

interact(".draggable-item").draggable({
    inertia: false,
    listeners: {
        start: function (event) {
            const dragged = event.target;
            isDragging = true;
            tooltip.style.display = "none";

            ghost = makeGhost(dragged.dataset.item);
            document.body.appendChild(ghost);
            moveGhost(event);

            dragged.classList.add("dragging-source");
        },
        move: moveGhost,
        end: function (event) {
            const dragged = event.target;
            isDragging = false;
            dragged.classList.remove("dragging-source");

            if (ghost) {
                ghost.remove();
                ghost = null;
            }

            // dropped a recipe item outside the slots, so remove it
            if (dragged.dataset.slot !== undefined && !event.dropzone) {
                const slotName = dragged.dataset.slot;
                setSlot(slotName, null);
                slotsChanged([slotName]);
            }
        }
    }
});

interact(".grid-cell, .output-cell").dropzone({
    accept: ".draggable-item",
    ondragenter: function (event) {
        event.target.classList.add("drop-hover");
    },
    ondragleave: function (event) {
        event.target.classList.remove("drop-hover");
    },
    ondrop: function (event) {
        const targetCell = event.target;
        targetCell.classList.remove("drop-hover");

        const toSlot = targetCell.dataset.slot;
        const dragged = event.relatedTarget;
        const itemId = dragged.dataset.item;
        const fromSlot = dragged.dataset.slot; // undefined when it came from the palette

        if (fromSlot === toSlot) {
            return;
        }

        if (fromSlot !== undefined) {
            setSlot(fromSlot, getSlot(toSlot));
            setSlot(toSlot, itemId);
            slotsChanged([fromSlot, toSlot]);
        } else {
            setSlot(toSlot, itemId);
            slotsChanged([toSlot]);
        }
    }
});

// item palette at the bottom

function buildPalette() {
    const fragment = document.createDocumentFragment();

    ItemSprites.items.forEach(function (item) {
        const cell = document.createElement("div");
        cell.className = "draggable-item palette-item";
        cell.dataset.item = item.itemID;
        cell.dataset.type = item.type || "item";
        cell.dataset.search = (item.DisplayName + " " + item.itemID + " " + (item.tags || []).join(" ")).toLowerCase();

        const sprite = ItemSprites.createSprite(item.itemID);
        sprite.loading = "lazy";
        cell.appendChild(sprite);
        fragment.appendChild(cell);
    });

    paletteGrid.appendChild(fragment);
    refreshPalette();
}

// shows the cells that match the search, the items/fluids selector and hideFluids
function refreshPalette() {
    const search = paletteSearch.value.trim().toLowerCase();
    const hideFluids = shouldHideFluids(state.recipeType);

    paletteType.querySelector('option[value="fluid"]').disabled = hideFluids;
    if (hideFluids) {
        paletteType.value = "item";
    }
    paletteType.disabled = hideFluids;

    const wantedType = paletteType.value;
    let shown = 0;

    paletteGrid.querySelectorAll(".palette-item").forEach(function (cell) {
        const matchesSearch = search === "" || cell.dataset.search.includes(search);
        cell.hidden = !(matchesSearch && cell.dataset.type === wantedType);
        if (!cell.hidden) {
            shown++;
        }
    });

    paletteStatus.textContent = shown + " " + wantedType + "s";
}

paletteSearch.addEventListener("input", refreshPalette);
paletteType.addEventListener("change", refreshPalette);

// startup

async function startPage() {
    try {
        const draft = await getDraft();
        if (draft && recipeTypes[draft.recipeType]) {
            state.recipeType = draft.recipeType;
            state.slots = draft.slots || {};
            state.outputCount = Math.min(64, Math.max(1, parseInt(draft.outputCount, 10) || 1));
            state.xp = draft.xp || "";
            state.cookingTime = draft.cookingTime || "";
            state.customText = draft.customText || "";
            state.recipeId = draft.recipeId || null;
            state.editingIndex = draft.editingIndex === undefined ? null : draft.editingIndex;
        }
    } catch (error) {
        console.error("couldn't load the draft:", error);
    }

    // draw the draft before building the palette so its sprites load first
    drawRecipeType();

    try {
        await ItemSprites.load();
        buildPalette();
        drawAllSlots();
    } catch (error) {
        console.error(error);
        paletteStatus.textContent = "couldn't load Resources/Items.json (" + error.message + "). " +
            "run python -m http.server in the KubeJS-Visual-Editor folder and open " +
            "http://localhost:8000/main-frontend/recipe-create.html";
    }
}

window.addEventListener("DOMContentLoaded", startPage);
