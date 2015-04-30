/**
 * angular-translate-extractor
 * https://github.com/angular-translate/angular-translate-extractor
 *
 * Copyright (c) 2015 DocuSign Inc., Joon Ho Cho, contributors
 * Licensed under the MIT license.
 */

'use strict';

var _ = require('lodash'),
  fs = require('fs'),
  Translations = require('./lib/translations.js')

/* Extract translations from strings based on regex, accumulating in object
 * @param {Object} options
 *        @option {String} startDelimiter Starting token to match around the translations
 *        @option {String} endDelimiter Ending token to match around the translations
 *        @option {String} defaultLang Default language locale
 *        @option {String} dest Part of path to use for reading existing
 *                translation JSON files
 *        @option {Object} customRegex Mapping of regular expressions used to match
 *                translations in content
 *        @option {String} customTranslateMatch Configurable string used to match a
 *                custom translation filter/directive/service
 *        @option {Boolean} safeMode Determine if translations read from existing
 *                JSON file should be overwritten (false) or extended (true)
 *        @option {Object} logger Reference to object which implements .log()
*/
module.exports = function translateExtractor(options) {
  options = _.assign({
    startDelimiter: '{{',
    endDelimiter: '}}',
    defaultLang: 'en-US',
    dest: '.',
    customRegex: {},
    customTranslateMatch: 'translate',
    safeMode: false,
    logger: console
  }, options);

  var logger = options.logger,
    escapedStartDelimiter = escapeRegExp(options.startDelimiter),
    escapedEndDelimiter = escapeRegExp(options.endDelimiter),
    escapedCustomTranslateMatch = escapeRegExp(options.customTranslateMatch),
    regexs = {
      commentSimpleQuote: '\\/\\*\\s*i18nextract\\s*\\*\\/\'((?:\\\\.|[^\'\\\\])*)\'',
      commentDoubleQuote: '\\/\\*\\s*i18nextract\\s*\\*\\/"((?:\\\\.|[^"\\\\])*)"',
      HtmlFilterSimpleQuote: escapedStartDelimiter + '\\s*\'((?:\\\\.|[^\'\\\\])*)\'\\s*\\|\\s*' + escapedCustomTranslateMatch + '(:.*?)?\\s*' + escapedEndDelimiter,
      HtmlFilterDoubleQuote: escapedStartDelimiter + '\\s*"((?:\\\\.|[^"\\\\\])*)"\\s*\\|\\s*' + escapedCustomTranslateMatch + '(:.*?)?\\s*' + escapedEndDelimiter,
      HtmlDirective: '<[^>]*' + escapedCustomTranslateMatch + '[^{>]*>([^<]*)<\/[^>]*>',
      HtmlDirectiveStandalone: escapedCustomTranslateMatch + '="((?:\\\\.|[^"\\\\])*)"',
      HtmlDirectivePluralLast: escapedCustomTranslateMatch + '="((?:\\\\.|[^"\\\\])*)".*angular-plural-extract="((?:\\\\.|[^"\\\\])*)"',
      HtmlDirectivePluralFirst: 'angular-plural-extract="((?:\\\\.|[^"\\\\])*)".*translate="((?:\\\\.|[^"\\\\])*)"',
      HtmlNgBindHtml: 'ng-bind-html="\\s*\'((?:\\\\.|[^\'\\\\])*)\'\\s*\\|\\s*translate(:.*?)?\\s*"',
      JavascriptServiceSimpleQuote: '\\$translate\\(\\s*\'((?:\\\\.|[^\'\\\\])*)\'[^\\)]*\\)',
      JavascriptServiceDoubleQuote: '\\$translate\\(\\s*"((?:\\\\.|[^"\\\\])*)"[^\\)]*\\)',
      JavascriptServiceInstantSimpleQuote: '\\$translate\\.instant\\(\\s*\'((?:\\\\.|[^\'\\\\])*)\'[^\\)]*\\)',
      JavascriptServiceInstantDoubleQuote: '\\$translate\\.instant\\(\\s*"((?:\\\\.|[^"\\\\])*)"[^\\)]*\\)',
      JavascriptFilterSimpleQuote: '\\$filter\\(\\s*\'' + escapedCustomTranslateMatch + '\'\\s*\\)\\s*\\(\\s*\'((?:\\\\.|[^\'\\\\])*)\'[^\\)]*\\)',
      JavascriptFilterDoubleQuote: '\\$filter\\(\\s*"' + escapedCustomTranslateMatch + '"\\s*\\)\\s*\\(\\s*"((?:\\\\.|[^"\\\\\])*)"[^\\)]*\\)'
    };

  // Add custom regex
  _.forEach(options.customRegex, function (regex, key) {
    regexs['others_' + key] = regex;
  });


  /* Extract translations from string, accumulating in results
   * @param {String} content String to extract from
   * @param {Object} results Object to accumulate to
   */
  function extractor(content, results) {
    results = results || {};

    _.forEach(regexs, function(regexStr, regexName) {
      var _regex = new RegExp(regexStr, "gi");

      // Match all occurences
      var matches = content.match(_regex);
      if (_.isArray(matches) && matches.length) {
        // Through each matches, we'll execute regex to get translation key
        _.forEach(matches, function (match) {
          if (match !== "") {
            extractTranslation(regexName, _regex, match, results);
          }
        });
      }
    });

    return results;
  }

  /* Extract translations from string, accumulating in results
   * @param {Object} results Output from `extractor`
   * @param {String} lang Locale string to use for reading an existing translation JSON file
   * @param {Object} _options
   *        @option {Boolean} safeMode Determine if translations read from
   *                existing JSON file should be overwritten (false) or extended (true)
   *        @option {String} dest Part of path to use for reading existing
   *                translation JSON file
   *        @option {String} defaultLang Default locale string
   */
  function mergeTranslations(results, lang, _options) {
    _options = _options || options
    // Create translation object
    var _translation = new Translations({
        "safeMode": _options.safeMode,
        "tree": false,
        "nullEmpty": false
      }, results),
      destFileName = _options.dest + '/' + lang + '.json',
      isDefaultLang = (_options.defaultLang === lang),
      translations = {},
      json = {},
      stats, statsString;

    try {
      var data = fs.readFileSync(destFileName);
      json = JSON.parse(data);
      translations = _translation.getMergedTranslations(Translations.flatten(json), isDefaultLang);
    }
    catch (err) {
      translations = _translation.getMergedTranslations({}, isDefaultLang);
    }
    stats = _translation.getStats();
    statsString = lang + " statistics: " +
      " Updated: " + stats["updated"] +
      " / Deleted: " + stats["deleted"] +
      " / New: " + stats["new"];
    logger.log(statsString);

    return translations;
  };

  return {
    extractor: extractor,
    mergeTranslations: mergeTranslations
  }

}

/* Extract translations from strings based on regex, accumulating in object
 * @param {String} regexName Used to determine special extractions
 * @param {RegExp} regex Used to match the translation
 * @param {String} content String to match the regex against
 * @param {Object} results Object where resulting translation extractions will be stored
*/
function extractTranslation(regexName, regex, content, results) {
  var r;
  regex.lastIndex = 0;
  while ((r = regex.exec(content)) !== null) {

    // Result expected [STRING, KEY, SOME_REGEX_STUF]
    // Except for plural hack [STRING, KEY, ARRAY_IN_STRING]
    if (r.length >= 2) {
      var translationKey, evalString;
      var translationDefaultValue = "";

      switch (regexName) {
        case 'HtmlDirectivePluralFirst':
          var tmp = r[1];
          r[1] = r[2];
          r[2] = tmp;
        case 'HtmlDirectivePluralLast':
          evalString = eval(r[2]);
          if (_.isArray(evalString) && evalString.length >= 2) {
            translationDefaultValue = "{NB, plural, one{" + evalString[0] + "} other{" + evalString[1] + "}" + (evalString[2] ? ' ' + evalString[2] : '');
          }
          translationKey = r[1].trim();
          break;
        default:
          translationKey = r[1].trim();
      }

      // Avoid empty translation
      if (translationKey === "") {
        return;
      }

      switch (regexName) {
        case "commentSimpleQuote":
        case "HtmlFilterSimpleQuote":
        case "JavascriptServiceSimpleQuote":
        case "JavascriptServiceInstantSimpleQuote":
        case "JavascriptFilterSimpleQuote":
        case "HtmlNgBindHtml":
          translationKey = translationKey.replace(/\\\'/g, "'");
          break;
        case "commentDoubleQuote":
        case "HtmlFilterDoubleQuote":
        case "JavascriptServiceDoubleQuote":
        case "JavascriptServiceInstantDoubleQuote":
        case "JavascriptFilterDoubleQuote":
          translationKey = translationKey.replace(/\\\"/g, '"');
          break;
      }
      results[translationKey] = translationDefaultValue;
    }
  }
};

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
};
