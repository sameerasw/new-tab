# New Tab with bookmarks

<img width="1280" height="832" alt="CleanShot-CleanShot-CleanShot-20260621-11  00 31@2x Large" src="https://github.com/user-attachments/assets/7ed9f5de-be9d-44b3-af67-25643214e226" />


https://github.com/user-attachments/assets/57e0210c-0932-4122-b80e-2ff0ad43ac99


A minimalistic, customizable new tab page extension for Chromium-based browsers. It displays your bookmarks in rows, supports setting your own CSS and allows Vimium C to inject itself for that tasty vim motion flow. 

## Features

- **Custom bookmark display:** Shows bookmarks from a selected folder in rows. 
- **Customizable Layout:** Choose how many icons per row and the maximum number of bookmarks to display.
- **Custom CSS:** Add your own styles in the options page for advanced tweaks.
- **Background Styling:** Use the `#background` selector in your custom CSS for an option to add a background image (check the [sample](#sample-background-image-css)).
- **Vimium C handling** Can use Vimium C plugin directly on the page. 
- **Favicon Handling:** Uses Google’s favicon service with a fallback to a default icon.

## Installation
- Load the repo as an unpacked extension in Chrome via `chrome://extensions`.

## Sample background image css

```css
#background{
    background: center / contain url("https://dummyimage.com/300.png/09f/fff&text=Hello"), #000000;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: center center;
}

#background::before {
    content: "";
    position: fixed;
    width: 100%;
    height: 100%;
    background: inherit;
    filter: brightness(30%);
    z-index: -1;
}
```

## Other
- Icons taken from - https://fonts.google.com/icons. 
