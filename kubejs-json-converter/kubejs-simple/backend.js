document.addEventListener("DOMContentLoaded", () => {

    var db = new Dexie("StorageDatabase");

    db.version(1).stores({
        values: "id, kubejs, simple"
    });

    db.open()
        .then(() => console.log("[DB] Opened successfully"))
        .catch(err => console.error("[DB] Open failed:", err));

    document.getElementById("kubejs-text").addEventListener("input", async (event) => {
        const old = await db.values.get(1) || {};
        
        await db.values.put({
            ...old,
            id: 1,
            kubejs: event.target.value
        });
    });

    document.getElementById("simple-text").addEventListener("input", async (event) => {
        const old = await db.values.get(1) || {};

        await db.values.put({
            ...old,
            id: 1,
            simple: event.target.value
        }); 
    });

    db.values.get(1).then(data => {
        if (data) {
            document.getElementById("kubejs-text").value = data.kubejs || "";
            document.getElementById("simple-text").value = data.simple || "";
        }
    });

});