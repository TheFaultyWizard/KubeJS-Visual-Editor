// connects Resources/Items.json to the sprites in Resources/assets
// items.json looks like [{ itemID, DisplayName, tags }]
// sprites are named like minecraft_oak_log.png for minecraft:oak_log
//
// how to use:
//   await ItemSprites.load()
//   ItemSprites.items           every item
//   ItemSprites.spriteUrl(id)   path to the sprite
//   ItemSprites.nameOf(id)      display name, or the id if its not found
//   ItemSprites.search(text)    items matching a name, id or tag
//   ItemSprites.createSprite(id) makes an img element
//
// needs to be served over http, fetch doesnt work on file://

const ItemSprites = {
    items: [],
    byId: new Map(),
    loaded: false,
    loadPromise: null
};

const resourcesFolder = "../Resources/";

ItemSprites.spriteUrl = function (itemId) {
    return resourcesFolder + "assets/" + String(itemId).replace(":", "_") + ".png";
};

ItemSprites.nameOf = function (itemId) {
    const item = ItemSprites.byId.get(itemId);
    if (item) {
        return item.DisplayName;
    }
    return itemId;
};

ItemSprites.load = function () {
    // only fetch once
    if (ItemSprites.loadPromise) {
        return ItemSprites.loadPromise;
    }

    ItemSprites.loadPromise = fetch(resourcesFolder + "Items.json")
        .then(function (response) {
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }
            return response.json();
        })
        .then(function (list) {
            ItemSprites.items = list;
            list.forEach(function (item) {
                ItemSprites.byId.set(item.itemID, item);
            });
            ItemSprites.loaded = true;
            return list;
        });

    return ItemSprites.loadPromise;
};

ItemSprites.search = function (text) {
    const search = String(text || "").trim().toLowerCase();
    if (search === "") {
        return ItemSprites.items;
    }

    return ItemSprites.items.filter(function (item) {
        const name = item.DisplayName.toLowerCase();
        const id = item.itemID.toLowerCase();
        const tags = (item.tags || []).join(" ").toLowerCase();
        return name.includes(search) || id.includes(search) || tags.includes(search);
    });
};

ItemSprites.createSprite = function (itemId) {
    const image = document.createElement("img");
    image.className = "item-sprite";
    image.src = ItemSprites.spriteUrl(itemId);
    image.alt = ItemSprites.nameOf(itemId);
    image.draggable = false;

    // hide it if the sprite is missing
    image.addEventListener("error", function () {
        image.style.visibility = "hidden";
    });

    return image;
};
