// recipe creation page, drag items into the grid with interact.js
// needs interact.js, dexie, converter.js, shared.js and items-hook.js

// slots are "0" to "8" for the grid and "out" for the output
const grid = [null, null, null, null, null, null, null, null, null];
let outputItem = null;
let outputCount = 1;
let recipeType = "shaped"; // "shaped" or "shapeless"
let draftIndex = null; // where this recipe sits in the saved recipe list

const countInput = document.getElementById("output-count");
const paletteGrid = document.getElementById("palette-grid");
const paletteStatus = document.getElementById("palette-status");
const paletteSearch = document.getElementById("palette-search");
const paletteType = document.getElementById("palette-type");
const shapelessBox = document.getElementById("shapeless-toggle");
const tooltip = document.getElementById("item-tooltip");

let ghost = null;
let isDragging = false;

function getSlotElement(slot) {
    if (slot === "out") {
        return document.querySelector(".output-cell");
    }
    return document.querySelector('.grid-cell[data-slot="' + slot + '"]');
}

function getSlot(slot) {
    if (slot === "out") {
        return outputItem;
    }
    return grid[Number(slot)];
}

function setSlot(slot, itemId) {
    if (slot === "out") {
        outputItem = itemId;
    } else {
        grid[Number(slot)] = itemId;
    }
}

// simple json

// makes a shaped recipe from the grid
// only the used part of the grid is kept, each item gets a letter
function buildRecipe() {
    if (recipeType === "shapeless") {
        return buildShapelessRecipe();
    }

    const recipe = {
        type: "shaped",
        output: { item: outputItem, count: outputCount },
        pattern: [],
        key: {}
    };

    let firstRow = 3;
    let lastRow = -1;
    let firstCol = 3;
    let lastCol = -1;

    for (let index = 0; index < 9; index++) {
        if (grid[index]) {
            const row = Math.floor(index / 3);
            const col = index % 3;
            if (row < firstRow) firstRow = row;
            if (row > lastRow) lastRow = row;
            if (col < firstCol) firstCol = col;
            if (col > lastCol) lastCol = col;
        }
    }

    // nothing in the grid
    if (lastRow === -1) {
        return recipe;
    }

    const letters = {};
    let letterCount = 0;

    for (let row = firstRow; row <= lastRow; row++) {
        let line = "";
        for (let col = firstCol; col <= lastCol; col++) {
            const itemId = grid[row * 3 + col];
            if (!itemId) {
                line += " ";
            } else {
                if (!letters[itemId]) {
                    letters[itemId] = String.fromCharCode(65 + letterCount);
                    letterCount++;
                    recipe.key[letters[itemId]] = { item: itemId };
                }
                line += letters[itemId];
            }
        }
        recipe.pattern.push(line);
    }

    return recipe;
}

// shapeless just lists the items in the grid, order doesnt matter
function buildShapelessRecipe() {
    const recipe = {
        type: "shapeless",
        output: { item: outputItem, count: outputCount },
        ingredients: []
    };

    for (let index = 0; index < 9; index++) {
        if (grid[index]) {
            recipe.ingredients.push({ item: grid[index] });
        }
    }

    return recipe;
}

// saves go in a line so they dont run over each other
let saveQueue = Promise.resolve();

// saves the draft and puts the recipe in the saved json
// the recipe only goes in once it has an output and at least one ingredient
function saveEverything() {
    saveQueue = saveQueue.then(async function () {
        try {
            const recipe = buildRecipe();
            let hasIngredients = false;
            if (recipe.type === "shapeless") {
                hasIngredients = recipe.ingredients.length > 0;
            } else {
                hasIngredients = recipe.pattern.length > 0;
            }
            const isComplete = recipe.output.item && hasIngredients;
            const doc = await getSimpleDoc();

            if (doc === null) {
                console.error("saved simple json is broken, not touching it");
            } else {
                const list = doc.recipes;

                if (isComplete) {
                    if (draftIndex !== null && list[draftIndex]) {
                        list[draftIndex] = recipe;
                    } else {
                        draftIndex = list.length;
                        list.push(recipe);
                    }
                } else if (draftIndex !== null) {
                    if (list[draftIndex]) {
                        list.splice(draftIndex, 1);
                    }
                    draftIndex = null;
                }

                await saveSimpleDoc(doc);
            }

            await saveDraft({
                grid: grid.slice(),
                output: outputItem,
                count: outputCount,
                recipeType: recipeType,
                draftIndex: draftIndex,
                recipe: recipe
            });
        } catch (error) {
            console.error("save failed:", error);
        }
    });
}

// drawing

function drawSlot(slot) {
    const cell = getSlotElement(slot);
    const oldItem = cell.querySelector(".slot-item");
    if (oldItem) {
        oldItem.remove();
    }

    const itemId = getSlot(slot);
    if (!itemId) {
        return;
    }

    const holder = document.createElement("div");
    holder.className = "draggable-item slot-item";
    holder.dataset.item = itemId;
    holder.dataset.slot = slot;
    holder.appendChild(ItemSprites.createSprite(itemId));
    cell.appendChild(holder);
}

function drawAllSlots() {
    for (let index = 0; index < 9; index++) {
        drawSlot(String(index));
    }
    drawSlot("out");
    countInput.value = outputCount;
    shapelessBox.checked = (recipeType === "shapeless");
}

function slotsChanged(slots) {
    slots.forEach(drawSlot);
    saveEverything();
}

// output count

function readCount() {
    let count = parseInt(countInput.value, 10);
    if (isNaN(count)) {
        count = 1;
    }
    if (count < 1) count = 1;
    if (count > 64) count = 64;
    return count;
}

countInput.addEventListener("input", function () {
    // let them clear the box while typing
    if (countInput.value === "") {
        return;
    }
    outputCount = readCount();
    saveEverything();
});

countInput.addEventListener("change", function () {
    outputCount = readCount();
    countInput.value = outputCount;
    saveEverything();
});

// shapeless checkbox

shapelessBox.addEventListener("change", function () {
    if (shapelessBox.checked) {
        recipeType = "shapeless";
    } else {
        recipeType = "shaped";
    }
    refreshPalette();
    saveEverything();
});

// tooltip with the display name, follows the cursor

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

            ghost = document.createElement("img");
            ghost.className = "drag-ghost";
            ghost.src = ItemSprites.spriteUrl(dragged.dataset.item);
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
                const slot = dragged.dataset.slot;
                setSlot(slot, null);
                slotsChanged([slot]);
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
        const fromSlot = dragged.dataset.slot; // undefined if it came from the palette

        if (fromSlot === toSlot) {
            return;
        }

        if (fromSlot !== undefined) {
            // swap with whatever is in the target
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

// decides which palette cells are visible, based on the search box,
// the items/fluids selector and the hideFluids setting of the recipe type
function refreshPalette() {
    const search = paletteSearch.value.trim().toLowerCase();
    const hideFluids = shouldHideFluids(recipeType);

    // the selector is locked to items when fluids are hidden
    const fluidOption = paletteType.querySelector('option[value="fluid"]');
    fluidOption.disabled = hideFluids;
    if (hideFluids) {
        paletteType.value = "item";
    }
    paletteType.disabled = hideFluids;

    const wantedType = paletteType.value;
    let shown = 0;

    paletteGrid.querySelectorAll(".palette-item").forEach(function (cell) {
        const matchesSearch = search === "" || cell.dataset.search.includes(search);
        const matchesType = cell.dataset.type === wantedType;
        cell.hidden = !(matchesSearch && matchesType);
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
    // load the saved draft first so its sprites get requested before the palette ones
    try {
        const draft = await getDraft();
        if (draft) {
            for (let index = 0; index < 9; index++) {
                grid[index] = (draft.grid && draft.grid[index]) || null;
            }
            outputItem = draft.output || null;
            outputCount = Math.min(64, Math.max(1, parseInt(draft.count, 10) || 1));
            if (draft.recipeType === "shapeless") {
                recipeType = "shapeless";
            }
            draftIndex = draft.draftIndex === undefined ? null : draft.draftIndex;
        }
    } catch (error) {
        console.error("couldn't load the draft:", error);
    }
    drawAllSlots();

    try {
        await ItemSprites.load();
        buildPalette();
        drawAllSlots(); // draw again now that the names are loaded
    } catch (error) {
        console.error(error);
        paletteStatus.textContent = "couldn't load Resources/Items.json (" + error.message + "). " +
            "run python -m http.server in the KubeJS-Visual-Editor folder and open " +
            "http://localhost:8000/main-frontend/recipe-create.html";
    }
}

window.addEventListener("DOMContentLoaded", startPage);
