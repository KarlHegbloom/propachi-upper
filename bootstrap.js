const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
var Zotero;
var oldProcessor;

var prefOutputFormat; // "integration.outputFormat"
var prefMaxMaxOffset; // "integration.maxmaxOffset"

/*
 * Zotero runs citeproc-js synchronously within an async thread. We
 * can retrieve modules synchronously inside citeproc-js, and the
 * additional I/O will not impact the UI. Whew.
 */

function ifZotero(succeed, fail) {
    var ZoteroClass = Cc["@zotero.org/Zotero;1"];
    if (ZoteroClass) {
        Zotero = ZoteroClass
                .getService(Ci.nsISupports)
	        .wrappedJSObject;
        succeed ? succeed(Zotero) : null;
    } else {
        fail ? fail() : null;
    }
}

function replaceProcessor (Zotero) {
    oldProcessor = Zotero.CiteProc.CSL;
    Cu.import("resource://gre/modules/Services.jsm");
    Services.scriptloader.loadSubScript("chrome://propachi/content/citeproc.js", this, "UTF-8");
    Zotero.CiteProc.CSL = CSL;
}

function monkeypatchIntegration (Zotero) {
    ////////////////////////////////////////////////////////////////////////////
    // From: https://www.npmjs.com/package/monkeypatch
    //
    // npm install monkeypatch
    //
    //module.exports = function(obj, method, handler, context) {

    var propachi_npm_monkeypatch = function(obj, method, handler, context) {
        var original = obj[method];

        // Unpatch first if already patched.
        if (original.unpatch) {
            original = original.unpatch();
        }

        // Patch the function.
        obj[method] = function() {
            var ctx  = context || this;
            var args = [].slice.call(arguments);
            args.unshift(original.bind(ctx));
            return handler.apply(ctx, args);
        };

        // Provide "unpatch" function.
        obj[method].unpatch = function() {
            obj[method] = original;
            return original;
        };

        // Return the original.
        return original;
    };
    //
    // Examples:
    //
    // Patching a function
    //
    // Monkeypatch Date.now()
    // propachi_npm_monkeypatch(Date, 'now', function(original) {
    //   // Round to 15-minute interval.
    //   var ts = original();
    //   return ts - (ts % 900000);
    // });
    //
    // var timestamp = Date.now(); // returns a rounded timestamp
    //
    //
    // Patching an instance method
    //
    // Monkeypatch Date#getTime()
    // monkeypatch(Date.prototype, 'getTime', function(original) {
    //   // Round to 15-minute interval.
    //   var ts = original();
    //   return ts - (ts % 900000);
    // });
    //
    // var date      = new Date();
    // var timestamp = date.getTime(); // returns a rounded timestamp
    //
    //
    // Argument handling
    //
    // Monkeypatch Date#setTime()
    // monkeypatch(Date.prototype, 'setTime', function(original, ts) {
    //   // Round to 15-minute interval.
    //   ts = ts - (ts % 900000);
    //   // Call the original.
    //   return original(ts);
    // });
    //
    // var date = new Date();
    // date.setTime(date.getTime()); // set to a rounded timestamp
    //
    //
    // Unpatching
    // Monkeypatch Date.now()
    // monkeypatch(Date, 'now', function() { return 143942400000; });
    //
    // console.log(Date.now()); // logs 143942400000
    //
    // Date.now.unpatch();
    //
    // console.log(Date.now()); // logs current time


    // Ideas: Instead of trying to patch the integration.js, how about
    // overriding style.processCitationCluster(citation, citationsPre,
    // citationsPost); to make it munge the resulting formatted citations
    // between it and Zotero.Integration.Session.prototype.formatCitation
    // ?
    //
    // Also need to munge the results from getting the bibliography, so
    // style.makeBibliography(); ... it's output is modified to remove
    // ommittedItems and to replace items with customBibliographyText, so
    // what happens if I modify it between style.makeBibliography and
    // Zotero.Integration.Session.prototype.getBibliography()? Ok, it's
    // itemsToRemove is an array of indices, so as long as I don't remove
    // any of them, it should work fine no matter what I do to the text of
    // each item.

    // Q: How to change it's outputFormat, and to prevent it from putting
    // that {\\rtf... around it?

    // If I monkeypatch style.setOutputFormat(outputFormat); then how can
    // I ensure that it only changes it in the context of integration.js,
    // and not globally for every use of the citeproc within Juris-M?
    //
    // I think I can monkeypatch only one instance...
    //
    // It is set in only two places:
    //
    // Zotero.Integration.Session.prototype.setData = function(data, resetStyle)
    // Zotero.Integration.Session.BibliographyEditInterface.prototype._update = function()
    //


    propachi_npm_monkeypatch(Zotero.Integration.Session.prototype, 'setData', function(original, data, resetStyle) {
        var oldStyle = (this.data && this.data.style ? this.data.style : false);
        var ret = original(data, resetStyle); // performs: this.data = data;, ensures that this.style exists, etc.
        var outputFormat, new_style, original_style;
        // Same conditions by which original() determines whether to reset the style, using same information.
        if(data.style.styleID && (!oldStyle || oldStyle.styleID != data.style.styleID || resetStyle)) {
            // After it's done, we re-set the style. It really is this.style, not this.data.style here.
            // It's also certain at this point that this.style exists and is a Zotero.Citeproc.CSL.Engine.
            // Above the call to original(...) above, it might not have. It may have been reset, or not.
            outputFormat = Zotero.Prefs.get("integration.outputFormat") || "bbl";
            this.style.setOutputFormat(outputFormat);
            // pro-actively monkeypatch it for good measure.
            original_style = this.style;
            if (! original_style.setOutputFormat_is_propachi_monkeypatched) {
                new_style = Object.create(this.style);
                new_style.setOutputFormat = function(ignored_was_outputFormat_hard_coded) {
                    var outputFormat = Zotero.Prefs.get("integration.outputFormat") || "bbl";
                    original_style.setOutputFormat(outputFormat);
                };
                new_style.setOutputFormat_is_propachi_monkeypatched = true;
                this.style = new_style;
            }
        }
        return ret;
    });


    propachi_npm_monkeypatch(Zotero.Integration.Session.BibliographyEditInterface.prototype, '_update', function(original) {
        var ret, new_style;
        var original_style = this.session.style;
        if (! original_style.setOutputFormat_is_propachi_monkeypatched) {
            new_style = Object.create(this.session.style);
            new_style.setOutputFormat = function(ignored_was_outputFormat_hard_coded) {
                var outputFormat = Zotero.Prefs.get("integration.outputFormat") || "bbl";
                original_style.setOutputFormat(outputFormat);
            };
            new_style.setOutputFormat_is_propachi_monkeypatched = true;
            this.session.style = new_style;
        }
        return original(); // calls on setOutputFormat internally.
    });

    propachi_npm_monkeypatch(Zotero.Cite.System.prototype, 'setVariableWrapper', function(original, setValue) {
        // console.log("setVariableWrapper called.\n");
        var last_itemID = "";
        this.variableWrapper = function(params, prePunct, str, postPunct) {
            var this_itemID = params.context + "_" + params.itemData.id.toString();
            //
            // console.log("variableWrapper:variableNames[0]:" + params.variableNames[0]);
            // console.log("variableWrapper:context:" + params.context);
            // console.log("variableWrapper:itemData:" + JSON.stringify(params.itemData));
            // console.log("variableWrapper:itemData:" + JSON.stringify(params));
            //
            // The parsing below is necessary so that the right part gets wrapped with the
            // URL. It has to find the text-only part, and wrap the first 4 characters of
            // that. I don't want it to wrap LaTeX macros, for example. For some reason,
            // some of them come through, as when a font shape or styling has been applied
            // to it. The other strings we need to skip are the 00#@ and 000000000@# hacks.
            //

            // console.log("variableWrapper:str:" + str);
            //
            // Sample str values from real documents:
            //
            // W.W. Thornton
            // V
            // {\itshape{}Coram Nobis Et Coram Vobis}
            // {\scshape{}Wikipedia}
            // {\scshape{}Ind. L.J.}
            // 02#@UtahUtahX-X-X
            //
            // \ztHref{http://en.wikipedia.org/w/index.php?title=Maxims\_of\_equity\&oldid=532918962}{http://en.wikipedia.org/w/index.php?title=Maxims\_of\_equity\&oldid=532918962}
            //
            var fore, txt, aft;
            // I created this regexp by using the Firefox addon called "Regular Expression
            // Tester", by Sebo. I could not have done this without it.
            var str_parse = new Zotero.Utilities.XRegExp(/^((?:[0-9][-0-9a-zA-Z.@#]+(?:#@|@#)|\{?\\[a-z][a-zA-Z0-9}{]+(?:\{}?))+)*([^\}]+)(\}?.*)$/);
            var ligrx = new Zotero.Utilities.XRegExp(/^(...?ff[il]|...f[fil])/);
            var m = Zotero.Utilities.XRegExp.exec(str, str_parse);
            if (m != null) {
                // console.log("variableWrapper:m != null");
                // console.log("variableWrapper:m:" + JSON.stringify(m));
                // console.log("variableWrapper:m[0]:" + m[0]);
                fore = (m[1] ? m[1] : '');
                txt  = (m[2] ? m[2] : '');
                aft  = (m[3] ? m[3] : '');
            } else {
                // console.log("variableWrapper:m === null");
                fore = '';
                txt  = str;
                aft  = '';
            }

            // console.log("variableWrapper:fore:" + fore);
            // console.log("variableWrapper:txt:"  + txt);
            // console.log("variableWrapper:aft:"  + aft + "\n");

            // This will only run most of this function's code for the first variable in a citation or
            // bibliography entry (e.g., the title or the author) so that the first 4 characters of the first
            // word, no matter what CSL format was chosen by the user, will become a hyperlink. Obviously we don't
            // want every variable field in a citation or bibliography entry to have a hyperlink; only the first.
            //
            if (this_itemID === last_itemID) {
                return (prePunct + str + postPunct);
            } else {
                var URL = null;
                var DOI = params.itemData.DOI;
                if (DOI) {
                    URL = 'http://dx.doi.org/' + Zotero.Utilities.cleanDOI(DOI);
		}
		if (!URL) {
		    URL = params.itemData.URL ? params.itemData.URL : params.itemData.URL_REAL;
                }
                last_itemID = this_itemID;
                // any first field for this_itemID When
                // this splits between characters of a
                // ligature, it breaks the ligature and
                // makes too wide a space there. It needs
                // to look for that, and just include both
                // letters of the ligature into the link
                // text. e.g., "Griffin"
                // ff fi fl ffi ffl
                if (params.context === "bibliography") {
		    if (URL) {
                        // console.log("variableWrapper:URL:" + URL);
                        if (params.mode === 'rtf') {
			    return prePunct + '{\\field{\\*\\fldinst HYPERLINK "' + URL + '"}{\\fldrslt ' + str + '}}' + postPunct;
			}
                        else if (params.mode === 'bbl') {
                            if (txt.length > 4) {
                                var txtend = 4;
                                m = Zotero.Utilities.XRegExp.exec(txt, ligrx);
                                if (m != null) {
                                    txtend = m[0].length - 1;
                                }
                                // .replace(/([$_^{%&])(?!!)/g, "\\$1").replace(/([$_^{%&])!/g, "$1")
                                return prePunct
                                    + fore
                                    + '\\ztHrefFromBibToURL{#zbibSysID'
                                    + params.itemData.id.toString()
                                    +  '}{'
                                    + '\\path{' + URL.replace(/([$_^{%&])/g, "\\$1") + '}'
                                    + '}{'
                                    + txt.substring(0,txtend)
                                    + '}'
                                    + txt.substring(txtend)
                                    + aft
                                    + postPunct;
                            } else {
                                return prePunct
                                    + fore
                                    + '\\ztHrefFromBibToURL{#zbibSysID'
                                    + params.itemData.id.toString()
                                    + '}{'
                                    + '\\path{' + URL.replace(/([$_^{%&])/g, "\\$1") + '}'
                                    + '}{'
                                    + txt
                                    + '}'
                                    + aft
                                    + postPunct;
                            }
                        } else {
			    return prePunct + '<a id="zbibSysID' + params.itemData.id.toString() + '" '
                                + 'href="' + URL + '">' + str + '</a>' + postPunct;
			}
		    } else {
                        // console.log("variableWrapper:No URL");
			return (prePunct + str + postPunct);
		    }
                    // any first field for an id
		} else if (params.context === 'citation') {
                    if (params.mode === 'bbl') {
                        var theURL;
                        if (URL) {
                            // client Guile code and style package macros can use this to create a
                            // hyperlink to the on-line URL when there's no bibliography in the
                            // document. When there is one, then the ztHrefFromCiteToBib macro's
                            // first argument will link to a label loci inside the bibliography.
                            //
                            // There, in the bibliography, each item can have a link to this same
                            // URL; using the first four characters of the item's text as the
                            // display text.
                            //
                            theURL = '\\path{' + URL.replace(/([$_^{%&])/g, "\\$1") + '}';
                        } else {
                            theURL = '\\path{\\ztDefaultCiteURL}';
                        }
                        if (txt.length > 4) {
                            // Notice that the zbibSysID contains the item system id as assigned
                            // by Juris-M / Zotero. So these have enough information to program-
                            // atically form the zotero: URL that finds the citation.  This tag
                            // can look up the tree to find the citation cluster that it's in, and
                            // thus the zotero: URL's; perhaps in that cluster's field code data.
                            var txtend = 4;
                            m = Zotero.Utilities.XRegExp.exec(txt, ligrx);
                            if (m != null) {
                                txtend = m[0].length - 1;
                            }
                            return prePunct
                                + fore
                                + '\\ztHrefFromCiteToBib{#zbibSysID'
                                + params.itemData.id.toString()
                                + '}{'
                                + theURL
                                + '}{'
                                + txt.substring(0,txtend)
                                + '}'
                                + txt.substring(txtend)
                                + aft
                                + postPunct;
                        } else {
                            return prePunct
                                + fore
                                + '\\ztHrefFromCiteToBib{#zbibSysID'
                                + params.itemData.id.toString()
                                + '}{'
                                + theURL
                                + '}{'
                                + str
                                + '}'
                                + aft
                                + postPunct;
                        }
                    }
                } else {
		    return (prePunct + str + postPunct);
		}
            }
        }
    });

    // this.item_id, state (from bbl) this.item_id (from html)
    //
    //  "this" in that context is a CSL.Output.Formats
    //
    // An item_id is going to be an integer, from Zotero.
    //
    // !!!!! This does not work right. I get an error every time with it defined
    //
    // Zotero.Cite.System.prototype.embedBibliographyEntry = function(item_id, state) {
    //     // Inside here, a "this" is a Zotero.Cite.System...
    //     // and "state" is a ...?

    //     return "label1,label2,label3";
    // }


    // Zotero.Cite.System.prototype.wrapCitationEntryBbl = function(state, str, sys_id, item_id, locator_txt, suffix_txt) {
    //         console.log("wrapCitationEntryBbl called.\n");
    //         // <a href="zotero://select/items/%%ITEM_ID%%">{  | %%STRING%% | %%LOCATOR%% | %%SUFFIX%% }</a>
    //         var citationWrapperBbl = Zotero.Prefs.get("export.quickCopy.citationWrapperBbl") || "\\label{sysID%%SYS_ID%%}";
    //
    //         if (!locator_txt) {
    //                 locator_txt = "";
    //         }
    //         if (!suffix_txt) {
    //                 suffix_txt = "";
    //         }
    //         return citationWrapperBbl
    //                 .replace("%%STRING%%", str)
    //                 .replace("%%SYS_ID%%", sys_id)
    // 		.replace("%%ITEM_ID%%", item_id)
    // 		.replace("%%LOCATOR%%", locator_txt)
    // 		.replace("%%SUFFIX%%", suffix_txt);
    // }
    //
    // Zotero.Cite.System.prototype.wrapCitationEntry = Zotero.Cite.System.prototype.wrapCitationEntryBbl;

    // propachi_npm_monkeypatch(Zotero.Cite.System.prototype, 'embedBibliographyEntry', function(original, state, sys_id, item_id) {
    //         return "\\label{sysIDbib" + sys_id + "}";
    // });
}


function monkeyUnpatchIntegration(Zotero) {
    Zotero.Integration.Session.prototype.setData.unpatch &&
        Zotero.Integration.Session.prototype.setData.unpatch();

    Zotero.Integration.Session.BibliographyEditInterface.prototype._update.unpatch &&
        Zotero.Integration.Session.BibliographyEditInterface.prototype._update.unpatch();

    Zotero.Integration.Session.prototype.formatCitation.unpatch &&
        Zotero.Integration.Session.prototype.formatCitation.unpatch();

    Zotero.Integration.Session.prototype.getBibliography.unpatch &&
        Zotero.Integration.Session.prototype.getBibliography.unpatch();
}



function UiObserver() {
    this.register();
}

UiObserver.prototype = {
    observe: function(subject, topic, data) {
        ifZotero(
            function (Zotero) {
                replaceProcessor(Zotero);
                monkeypatchIntegration(Zotero);
            },
            null
        );
    },
    register: function() {
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);
        observerService.addObserver(this, "final-ui-startup", false);
    },
    unregister: function() {
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);
        observerService.removeObserver(this, "final-ui-startup");
    }
}
var uiObserver = new UiObserver();


/*
 * Bootstrap functions
 */

function startup (data, reason) {
    ifZotero(
        function (Zotero) {
            // Set immediately if we have Zotero
            replaceProcessor(Zotero);
            monkeypatchIntegration(Zotero);
        },
        function () {
            // If not, assume it will arrive by the end of UI startup
            uiObserver.register();
        }
    );
}

function shutdown (data, reason) {
    uiObserver.unregister();
    ifZotero(
        function (Zotero) {
            Zotero.CiteProc.CSL = oldProcessor;
            monkeyUnpatchIntegration(Zotero);
        },
        null
    );
}

function install (data, reason) {}
function uninstall (data, reason) {}
