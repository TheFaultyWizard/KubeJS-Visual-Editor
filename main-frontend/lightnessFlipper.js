function rgbToHsl(red, green, blue) {
    red /= 255; green /= 255; blue /= 255;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;

    let hue, saturation;
    const delta = max - min;

    if (max === min) {
        hue = saturation = 0;
    } else {
        saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        switch (max) {
            case red: hue = (green - blue) / delta + (green < blue ? 6 : 0); break;
            case green: hue = (blue - red) / delta + 2; break;
            case blue: hue = (red - green) / delta + 4; break;
        }
        hue /= 6;
    }
    return [Math.round(hue * 360), Math.round(saturation * 100), Math.round(lightness * 100)];
}

function lightnessFlip(colour) {
    const numbers = colour.match(/\d+/g)
    const [red, green, blue, alpha] = numbers.slice(0, numbers.length).map(Number);
    console.log(red, green, blue, alpha);
    const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
    return (alpha !== undefined) ? `hsla(${hue} ${saturation}% ${100 - lightness}% ${alpha})` : `hsl(${hue} ${saturation}% ${100 - lightness}%)`;
}

function toggleDarkMode() {
    document.querySelectorAll('*').forEach(element => {
        const style = getComputedStyle(element);
        console.log(style.color + (element.style.color = lightnessFlip(style.color)));
        console.log(style.backgroundColor + (element.style.backgroundColor = lightnessFlip(style.backgroundColor)));
    })
}

function initialise() {
    document.querySelectorAll('*').forEach(element => {
        const style = getComputedStyle(element);
        console.log(style.color);
        if (style.backgroundColor === 'rgba(0, 0, 0, 0)') {
            element.style.backgroundColor = 'rgb(255, 255, 255)';
        }
    })
}