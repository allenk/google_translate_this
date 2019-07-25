'use strict';

const APPLICABLE_PROTOCOLS = ["http:", "https:"];

function protocolIsApplicable(url) {
  var anchor = document.createElement('a');
  anchor.href = url;
  return APPLICABLE_PROTOCOLS.includes(anchor.protocol);
}

function showPageActionOnTab(tabInfo) {
  if (protocolIsApplicable(tabInfo.url)) {
    browser.pageAction.show(tabInfo.id);
  }
}

function translateCurrentPage() {
  browser.tabs.query({
    currentWindow: true,
    active: true
  }, function (foundTabs) {
    var currentTabId = foundTabs[0].id;
    var executing = browser.tabs.executeScript(currentTabId, {
      file: 'scripts/inject_google_translate_content.js'
    });
  });
}

if (browser.commands) {
  browser.commands.onCommand.addListener(function (action) {
    if (action == "translate-current-page") {
      translateCurrentPage();
    }
  });
}

if (browser.contextMenus) {
  browser.contextMenus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId == "translate-current-page") {
      translateCurrentPage();
    }
  });
  browser.contextMenus.create({
    id: "translate-current-page",
    title: browser.i18n.getMessage("translateCurrentPage"),
    contexts: ["all"]
  });
}

if (browser.browserAction) {
  browser.browserAction.setIcon({
    "path": {
      "19": "images/icon-19.png",
      "38": "images/icon-38.png"
    }
  });
  browser.browserAction.onClicked.addListener(translateCurrentPage);
}


if (browser.pageAction) {
  browser.pageAction.onClicked.addListener(translateCurrentPage);
  browser.tabs.query({}).then((tabs) => {
    var tab;
    for (tab of tabs) {
      showPageActionOnTab(tab);
    }
  });

  browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
    showPageActionOnTab(tab);
  });
}

var translateStaticLocation = "translate.googleapis.com";

function parseCsp(policy) {
  return policy.split(';').reduce((result, directive) => {
    const trimmed = directive.trim();
    if (!trimmed) {
      return result;
    }
    const split = trimmed.split(/\s+/g);
    const key = split.shift();
    if (!Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = split;
    }
    return result;
  }, {});
};

function joinCsp(parsedCsp) {
  let directives = [];
  for (var directiveName in parsedCsp) {
    let directiveValue = parsedCsp[directiveName];
    if (directiveValue.length === 0) {
      directives.push(directiveName);
    } else if (directiveValue.length === 1) {
      directives.push(directiveName + " " + directiveValue[0]);
    } else {
      directives.push(directiveName + " " + directiveValue.join(" "));
    }
  }
  return directives.join('; ');
}

function rewriteCSPHeader(e) {
  for (var header of e.responseHeaders) {
    if (header.name.toLowerCase() === "content-security-policy") {
      const parsedCsp = parseCsp(header.value);
      let newValue = insertOrAppend('script-src', translateStaticLocation, parsedCsp);
      newValue = insertOrAppend('script-src', "'unsafe-inline'", newValue);
      newValue = insertOrAppend('script-src', "'unsafe-eval'", newValue);
      newValue = insertOrAppend('style-src', translateStaticLocation, newValue);
      newValue = insertOrAppend('img-src', translateStaticLocation, newValue);
      newValue = insertOrAppend('img-src', "gstatic.com", newValue);
      const joinedCsp = joinCsp(newValue);
      console.log("---" + header.value);
      console.log("+++" + joinedCsp);
      console.log(header.value === joinedCsp);
      header.value = joinedCsp;
    }
  }
  return { responseHeaders: e.responseHeaders };
}

function insertOrAppend(typeOfContent, domain, oldValue) {
  if (!oldValue[typeOfContent]) {
    oldValue[typeOfContent] = [];
  }
  oldValue[typeOfContent].push(domain);
  return oldValue;
}

browser.webRequest.onHeadersReceived.addListener(rewriteCSPHeader,
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]);
