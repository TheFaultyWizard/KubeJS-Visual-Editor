// my recipes page, lists the saved recipes with edit and delete buttons
// needs dexie, converter.js, shared.js, items-hook.js, recipe-types.js, recipe-model.js

const recipeList = document.getElementById("recipe-list");

function makeCell(slotValue, count) {
    const cell = document.createElement("div");
    cell.className = "mini-cell";
    if (!slotValue) {
        return cell;
    }

    cell.title = ItemSprites.nameOf(slotValue);
    if (slotValue.charAt(0) === "#") {
        const tagLabel = document.createElement("span");
        tagLabel.className = "tag-label";
        tagLabel.textContent = slotValue.slice(1).split(":").pop();
        cell.appendChild(tagLabel);
    } else {
        cell.appendChild(ItemSprites.createSprite(slotValue));
    }

    if (count > 1) {
        const badge = document.createElement("span");
        badge.className = "count-badge";
        badge.textContent = count;
        cell.appendChild(badge);
    }
    return cell;
}

function makeArrow() {
    const arrow = document.createElement("span");
    arrow.className = "card-arrow";
    arrow.textContent = "→";
    return arrow;
}

function makeCellGroup(slotValues, className) {
    const group = document.createElement("div");
    group.className = className;
    slotValues.forEach(function (slotValue) {
        group.appendChild(makeCell(slotValue, 1));
    });
    return group;
}

// the same picture as the creation page, custom recipes only get inputs and outputs
function makeVisual(recipe) {
    const visual = document.createElement("div");
    visual.className = "card-visual";

    if (recipe.type === "custom") {
        const found = findCustomItems(recipe.json);
        visual.appendChild(makeCellGroup(found.inputs, "mini-group"));
        visual.appendChild(makeArrow());
        visual.appendChild(makeCellGroup(found.outputs, "mini-group"));
        return visual;
    }

    const recipeState = recipeToState(recipe);
    const layout = recipeTypes[recipe.type].layout;
    const slotValues = layoutSlots[layout].map(function (slotName) {
        return recipeState.slots[slotName] || null;
    });

    visual.appendChild(makeCellGroup(slotValues, "mini-group " + layout));
    visual.appendChild(makeArrow());
    visual.appendChild(makeCell(recipeState.slots.out, recipeState.outputCount));
    return visual;
}

function makeDetails(recipe) {
    const parts = [recipe.type];
    if (recipe.type === "custom" && typeof recipe.json.type === "string") {
        parts.push(recipe.json.type);
    }
    if (recipe.xp !== undefined) {
        parts.push("xp " + recipe.xp);
    }
    if (recipe.cookingTime !== undefined) {
        parts.push(recipe.cookingTime + " ticks");
    }
    if (recipe.id) {
        parts.push(recipe.id);
    }

    const details = document.createElement("div");
    details.className = "card-details";
    details.textContent = parts.join(" · ");
    return details;
}

function makeButton(label, onClick) {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function makeCard(recipe, index) {
    const card = document.createElement("div");
    card.className = "recipe-card";

    const info = document.createElement("div");
    info.className = "card-info";
    info.appendChild(makeDetails(recipe));
    info.appendChild(makeVisual(recipe));
    card.appendChild(info);

    const buttons = document.createElement("div");
    buttons.className = "card-buttons";
    buttons.appendChild(makeButton("Edit", function () {
        editRecipe(index, recipe);
    }));
    buttons.appendChild(makeButton("Delete", function () {
        deleteRecipe(index);
    }));
    card.appendChild(buttons);

    return card;
}

async function editRecipe(index, recipe) {
    const draft = recipeToState(recipe);
    draft.editingIndex = index;
    await saveDraft(draft);
    location.href = "recipe-create.html";
}

async function deleteRecipe(index) {
    if (!confirm("Delete this recipe?")) {
        return;
    }

    const doc = await getSimpleDoc();
    doc.recipes.splice(index, 1);
    await saveSimpleDoc(doc);

    // keep a recipe that is being edited pointing at the right entry
    const draft = await getDraft();
    if (draft && draft.editingIndex !== null && draft.editingIndex !== undefined) {
        if (draft.editingIndex === index) {
            draft.editingIndex = null;
        } else if (draft.editingIndex > index) {
            draft.editingIndex -= 1;
        }
        await saveDraft(draft);
    }

    drawRecipes();
}

function showMessage(text) {
    recipeList.innerHTML = "";
    const message = document.createElement("p");
    message.className = "page-note list-message";
    message.textContent = text;
    recipeList.appendChild(message);
}

async function drawRecipes() {
    const doc = await getSimpleDoc();
    if (doc === null) {
        showMessage("The saved recipes couldn't be read.");
        return;
    }
    if (doc.recipes.length === 0) {
        showMessage("No recipes yet. Save one from Recipe Creation.");
        return;
    }

    recipeList.innerHTML = "";
    doc.recipes.forEach(function (recipe, index) {
        try {
            recipeList.appendChild(makeCard(recipe, index));
        } catch (error) {
            console.error("couldn't draw recipe " + index + ":", error);
        }
    });
}

async function startPage() {
    try {
        await ItemSprites.load();
    } catch (error) {
        console.error(error);
    }
    drawRecipes();
}

window.addEventListener("DOMContentLoaded", startPage);
