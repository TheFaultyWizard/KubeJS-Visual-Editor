// turns the editor state into simple format recipes and back
// slot values are item ids, tags look like "#minecraft:planks"
// needs recipe-types.js and converter.js

function slotValueToStack(slotValue) {
    if (slotValue.charAt(0) === "#") {
        return { tag: slotValue.slice(1) };
    }
    return { item: slotValue };
}

function stackToSlotValue(stack) {
    if (!stack) {
        return null;
    }
    if (stack.tag) {
        return "#" + stack.tag;
    }
    return stack.item || null;
}

function readNumber(text) {
    if (text === "" || text === null || text === undefined) {
        return undefined;
    }
    return Number(text);
}

// builds a recipe from the editor state without checking it
function buildRawRecipe(state) {
    const recipeType = state.recipeType;
    const layout = recipeTypes[recipeType].layout;

    if (layout === "custom") {
        let json = null;
        try {
            json = JSON.parse(state.customText);
        } catch (error) {
            json = null;
        }
        return { type: "custom", json: json };
    }

    const recipe = {
        type: recipeType,
        output: { item: state.slots.out || null, count: state.outputCount }
    };

    if (recipeType === "shaped") {
        fillShapedRecipe(recipe, state.slots);
    } else if (recipeType === "shapeless") {
        recipe.ingredients = [];
        const stacksByValue = {};
        layoutSlots.grid.forEach(function (slotName) {
            const slotValue = state.slots[slotName];
            if (!slotValue) {
                return;
            }
            // the same item in several slots becomes one stack with a count
            if (stacksByValue[slotValue]) {
                stacksByValue[slotValue].count = (stacksByValue[slotValue].count || 1) + 1;
            } else {
                stacksByValue[slotValue] = slotValueToStack(slotValue);
                recipe.ingredients.push(stacksByValue[slotValue]);
            }
        });
    } else if (recipeType === "smithing") {
        if (state.slots.template) {
            recipe.template = slotValueToStack(state.slots.template);
        }
        recipe.base = state.slots.base ? slotValueToStack(state.slots.base) : null;
        recipe.addition = state.slots.addition ? slotValueToStack(state.slots.addition) : null;
    } else {
        recipe.input = state.slots.input ? slotValueToStack(state.slots.input) : null;
        if (recipeTypes[recipeType].cooking) {
            const xp = readNumber(state.xp);
            const cookingTime = readNumber(state.cookingTime);
            if (xp !== undefined) recipe.xp = xp;
            if (cookingTime !== undefined) recipe.cookingTime = cookingTime;
        }
    }

    if (state.recipeId) {
        recipe.id = state.recipeId;
    }
    return recipe;
}

// crops the grid to the used area and gives each item a letter
function fillShapedRecipe(recipe, slots) {
    recipe.pattern = [];
    recipe.key = {};

    let firstRow = 3;
    let lastRow = -1;
    let firstCol = 3;
    let lastCol = -1;

    for (let slotIndex = 0; slotIndex < 9; slotIndex++) {
        if (slots[String(slotIndex)]) {
            const row = Math.floor(slotIndex / 3);
            const col = slotIndex % 3;
            firstRow = Math.min(firstRow, row);
            lastRow = Math.max(lastRow, row);
            firstCol = Math.min(firstCol, col);
            lastCol = Math.max(lastCol, col);
        }
    }

    if (lastRow === -1) {
        return;
    }

    const letters = {};
    let letterCount = 0;

    for (let row = firstRow; row <= lastRow; row++) {
        let line = "";
        for (let col = firstCol; col <= lastCol; col++) {
            const slotValue = slots[String(row * 3 + col)];
            if (!slotValue) {
                line += " ";
                continue;
            }
            if (!letters[slotValue]) {
                letters[slotValue] = String.fromCharCode(65 + letterCount);
                letterCount++;
                recipe.key[letters[slotValue]] = slotValueToStack(slotValue);
            }
            line += letters[slotValue];
        }
        recipe.pattern.push(line);
    }
}

function findMissingPart(raw) {
    if (raw.type === "custom") {
        if (!raw.json || typeof raw.json !== "object" || Array.isArray(raw.json)) {
            return "the custom json isn't a valid json object";
        }
        if (typeof raw.json.type !== "string") {
            return 'the custom json needs a "type"';
        }
        return null;
    }
    if (!raw.output.item) {
        return "add an output item first";
    }
    if (raw.type === "shaped" && raw.pattern.length === 0) {
        return "add at least one ingredient";
    }
    if (raw.type === "shapeless" && raw.ingredients.length === 0) {
        return "add at least one ingredient";
    }
    if (raw.type === "smithing" && (!raw.base || !raw.addition)) {
        return "smithing needs a base and an addition";
    }
    if (raw.input === null) {
        return "add an input item first";
    }
    return null;
}

// returns { recipe } if it can be saved, otherwise { error }
// normalizeRecipe is the converter's own check
function buildRecipe(state) {
    const raw = buildRawRecipe(state);
    const missingPart = findMissingPart(raw);
    if (missingPart) {
        return { error: missingPart };
    }

    try {
        return { recipe: normalizeRecipe(raw, "recipe") };
    } catch (error) {
        return { error: error.message };
    }
}

// the other way around, used for editing and for the cards
function recipeToState(recipe) {
    const state = {
        recipeType: recipe.type,
        slots: {},
        outputCount: 1,
        xp: "",
        cookingTime: "",
        customText: "",
        recipeId: recipe.id || null
    };

    if (recipe.output) {
        state.slots.out = recipe.output.item;
        state.outputCount = recipe.output.count || 1;
    }

    if (recipe.type === "shaped") {
        recipe.pattern.forEach(function (line, row) {
            for (let col = 0; col < line.length; col++) {
                const letter = line.charAt(col);
                if (letter !== " " && recipe.key[letter]) {
                    state.slots[String(row * 3 + col)] = stackToSlotValue(recipe.key[letter]);
                }
            }
        });
    } else if (recipe.type === "shapeless") {
        let slotIndex = 0;
        recipe.ingredients.forEach(function (stack) {
            const copies = stack.count || 1;
            for (let copy = 0; copy < copies && slotIndex < 9; copy++) {
                state.slots[String(slotIndex)] = stackToSlotValue(stack);
                slotIndex++;
            }
        });
    } else if (recipe.type === "smithing") {
        state.slots.template = stackToSlotValue(recipe.template);
        state.slots.base = stackToSlotValue(recipe.base);
        state.slots.addition = stackToSlotValue(recipe.addition);
    } else if (recipe.type === "custom") {
        state.customText = JSON.stringify(recipe.json, null, 2);
    } else {
        state.slots.input = stackToSlotValue(recipe.input);
        if (recipe.xp !== undefined) state.xp = String(recipe.xp);
        if (recipe.cookingTime !== undefined) state.cookingTime = String(recipe.cookingTime);
    }

    return state;
}

// custom recipes can be anything, so this guesses which ids are inputs and which are outputs
function findCustomItems(json) {
    const found = { inputs: [], outputs: [] };

    function walk(value, isOutput) {
        if (Array.isArray(value)) {
            value.forEach(function (entry) {
                walk(entry, isOutput);
            });
            return;
        }
        if (value === null || typeof value !== "object") {
            return;
        }

        const id = value.item || value.fluid || (value.tag ? "#" + value.tag : null);
        if (typeof id === "string") {
            (isOutput ? found.outputs : found.inputs).push(id);
        }

        Object.keys(value).forEach(function (key) {
            const child = value[key];
            const keyIsOutput = /^(result|results|output|outputs)$/.test(key);
            if (typeof child === "string" && keyIsOutput) {
                found.outputs.push(child);
            } else {
                walk(child, isOutput || keyIsOutput);
            }
        });
    }

    walk(json, false);
    return found;
}
