// settings for each recipe type
// hideFluids: true means fluids dont show up in the item browser for that type
// add new recipe types here when they get added to the editor

const recipeTypes = {
    shaped: { hideFluids: true },
    shapeless: { hideFluids: true }
};

// debug override, see forceShowFluids below
let fluidsForced = false;

function shouldHideFluids(recipeType) {
    if (fluidsForced) {
        return false;
    }
    const settings = recipeTypes[recipeType];
    if (settings && settings.hideFluids) {
        return true;
    }
    return false;
}

// run forceShowFluids() in the js console to show fluids no matter what
// forceShowFluids(false) turns it back off
function forceShowFluids(turnOn) {
    if (turnOn === undefined) {
        turnOn = true;
    }
    fluidsForced = !!turnOn;

    // refreshPalette is on the recipe page, other pages dont have it
    if (typeof refreshPalette === "function") {
        refreshPalette();
    }
    console.log("fluids forced: " + fluidsForced);
}
window.forceShowFluids = forceShowFluids;
