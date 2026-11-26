// layout: which input slots the recipe type uses
// hideFluids: true hides fluids in the item browser for that type

const recipeTypes = {
    shaped: { layout: "grid", hideFluids: true },
    shapeless: { layout: "grid", hideFluids: true },
    smithing: { layout: "smithing", hideFluids: true },
    smelting: { layout: "single", hideFluids: true, cooking: true },
    blasting: { layout: "single", hideFluids: true, cooking: true },
    smoking: { layout: "single", hideFluids: true, cooking: true },
    campfire_cooking: { layout: "single", hideFluids: true, cooking: true },
    stonecutting: { layout: "single", hideFluids: true },
    custom: { layout: "custom", hideFluids: false }
};

const layoutSlots = {
    grid: ["0", "1", "2", "3", "4", "5", "6", "7", "8"],
    smithing: ["template", "base", "addition"],
    single: ["input"],
    custom: []
};

let fluidsForced = false;

function shouldHideFluids(recipeType) {
    if (fluidsForced) {
        return false;
    }
    const settings = recipeTypes[recipeType];
    return Boolean(settings && settings.hideFluids);
}

// debug command for the console, forceShowFluids(false) turns it off
function forceShowFluids(turnOn) {
    if (turnOn === undefined) {
        turnOn = true;
    }
    fluidsForced = Boolean(turnOn);

    if (typeof refreshPalette === "function") {
        refreshPalette();
    }
    console.log("fluids forced: " + fluidsForced);
}
window.forceShowFluids = forceShowFluids;
