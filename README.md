# `propachi-texmacs` #

This is a necessary component of the [`zotero-texmacs-integration`](https://github.com/KarlHegbloom/zotero-texmacs-integration) plugin for [TeXmacs](http://www.texmacs.org). It is an add-on for Firefox that modifies the Juris-M or Zotero plugin's LibreOffice integration to make it compatible with TeXmacs. Once it's installed, in order to use the LibreOffice plugin, disable this plugin and restart Firefox. To go back to using it with TeXmacs, enable this plugin and restart Firefox. Someday perhaps there will be a configuration option so you don't have to enable/disable it via the plugin management interface, but instead, through a menu... The problem with that is that this plugin contains a *monkey patch* that's not designed for switching on and off at runtime. Because it is a “warm patch”, installed by it's start-up code, when that start-up code does not run, the “warm patch” isn't installed. So using the standard Firefox add-on configuration interface, you can disable this plugin, then restart Firefox to be running without it. I think once you start using TeXmacs, you won't want to use LibreOffice to write your documents anymore anyway, so you won't need to enable/disable this very often. But when you need to do that, I've just explained how to do it without totally uninstalling this plugin, so you can re-enable it when you want.

This is a *monkey patch* to the [Juris-M](https://juris-m.github.io) (or [Zotero](https://www.zotero.org)) reference manager, which runs as an add-on inside of the [Firefox](https://www.mozilla.org/en-US/firefox/products/) web browser. It replaces the `citeproc-js` inside of Juris-M / Zotero with one that has certain options enabled, and also has been extended with a new `outputFormat`, called “`bbl`”, since it at least *began* as BibTeX `bbl` file compatible LaTeX. It has evolved to be a better fit with TeXmacs, and no longer looks exactly like a LaTeX `bbl` file, but LaTeX macros should be easy enough to define that would make it into LaTeX BibTeX compatible markup again, in case anyone wants to use it for regular LaTeX someday.

The *monkey patch* also overrides some functions inside the Juris-M / Zotero `integration.js` in order to cause the LibreOffice integration to output in the new `bbl` format instead of in `rtf` format. Additionally, it enables and injects via a *monkey patch*, a `variableWrapper()` function, which is used to wrap the first 4 characters of the first item in a reference citation with a hyperlink to the bibliography entry when a `zbibliography` exists in the document, and the first 4 characters of a bibliography entry with a hyperlink to the URL in that Zotero entry, if it has one.

Code inside of the TeXmacs plugin also adds a list of back-references from each bibliography entry back to the point in the document where the citation occurred. If a reference is cited more than once, then there's more than one back-reference shown, one for each point of citation within the document. This *monkey patch* plugin is necessary for that to work properly, since it is what provides the TeXmacs document with the necessary labels for the intra-document hyperlinks.
