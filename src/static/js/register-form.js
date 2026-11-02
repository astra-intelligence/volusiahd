/* The registration form, narrowed to the kind of program being registered.
 *
 * Thirteen kinds of program, one form, and about forty questions between them.
 * Showing all forty to everybody would be a form most people abandon, so the
 * heading somebody picks decides what stays on screen. Two attributes carry
 * everything this needs, both written by the server:
 *
 *   data-asked-by   on an input — the headings that ask this question at all
 *   data-categories on an option — the headings offered this particular answer
 *
 * Both are lists of category slugs, and the chosen heading's slug rides along on
 * its own <option> as data-slug. Nothing here is load-bearing. With the script
 * switched off every question is shown, and the server decides what it asked
 * about rather than trusting the shape of what came back — see
 * `questions.py` and `ProgramRegistrationForm._forget_unasked`.
 *
 * On not clearing what it hides: a hidden field keeps whatever was typed in it.
 * Somebody who fills in their meeting days, realises they picked the wrong
 * heading and corrects it should find their work still there, and the server
 * drops answers to questions it did not ask anyway. Clearing would be us
 * protecting a rule that is already enforced somewhere it cannot be bypassed,
 * at the cost of the one mistake this form makes easy to recover from.
 */

(function () {
  "use strict";

  function slugOf(select) {
    var option = select.options[select.selectedIndex];
    return (option && option.dataset.slug) || "";
  }

  function offeredTo(element, slug) {
    // No heading chosen yet: show everything, which is what the server does too.
    if (slug === "") return true;
    // A general tag belongs to no heading, so it's offered under all of them.
    if (element.hasAttribute("data-general")) return true;
    var attribute = element.getAttribute("data-asked-by") || element.getAttribute("data-categories");
    if (attribute === null) return true;
    return attribute.split(" ").indexOf(slug) !== -1;
  }

  // A word typed into the tag box that isn't a tag is posted with this prefix,
  // and the server files it as a suggestion. See `NEW_TAG_PREFIX` in forms.py.
  var NEW_TAG = "new:";
  var MAX_SUGGESTIONS = 3;

  /* A <select multiple> narrowed by removing options, which is why the full set
   * is held here rather than read back off the element: widening again has to put
   * them back in their original order. */
  function optionNarrower(select) {
    var all = Array.prototype.slice.call(select.options);
    return function (slug) {
      var offered = all.filter(function (option) {
        return slug !== "" && offeredTo(option, slug);
      });
      // An option that is no longer on offer cannot stay chosen.
      all.forEach(function (option) {
        if (offered.indexOf(option) === -1) option.selected = false;
      });
      // Suggestions typed into the tag box (#40) aren't in the original set, and
      // belong to no heading, so they survive a change of heading.
      var typed = Array.prototype.filter.call(select.options, function (option) {
        return option.value.indexOf(NEW_TAG) === 0;
      });
      select.textContent = "";
      offered.forEach(function (option) {
        select.appendChild(option);
      });
      typed.forEach(function (option) {
        select.appendChild(option);
      });
      return offered.length;
    };
  }

  function start() {
    var form = document.querySelector("[data-scoped-form]");
    if (!form) return;
    var category = form.querySelector("select[name='category']");
    if (!category) return;

    var tagSelect = form.querySelector("select[data-tag-select]");
    var tagHint = form.querySelector("[data-tag-hint]");
    var narrowTags = tagSelect ? optionNarrower(tagSelect) : null;
    var jq = window.jQuery;
    var enhanced = tagSelect && jq && typeof jq.fn.select2 === "function";

    if (enhanced) {
      // `size` only helps the native fallback; Select2 would honour it as a height.
      tagSelect.removeAttribute("size");
      oneTagBox(form, tagSelect, jq);
    }

    form.querySelectorAll("input[data-class-list]").forEach(function (input) {
      classList(input, jq);
    });

    // Enter in a chip box means "add this", never "next page" or "send". Select2
    // blocks the keystroke itself in most browsers but not all, and a form that
    // jumps a page when someone adds a class loses them. Registered before the
    // page-by-page handler, so it gets the first say.
    form.addEventListener("submit", function (event) {
      var active = document.activeElement;
      var box = active && active.closest ? active.closest(".select2") : null;
      if (!box || !form.contains(box)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var select = box.previousElementSibling;
      if (select && typeof select.addTyped === "function") select.addTyped(active);
    });

    var scoped = Array.prototype.slice.call(form.querySelectorAll("[data-asked-by]"));
    // Radios and checkboxes carry the attribute on every one of their inputs, so
    // the same field turns up several times. Once is enough.
    var scopedFields = [];
    scoped.forEach(function (input) {
      var field = input.closest(".field");
      if (field && scopedFields.indexOf(field) === -1) scopedFields.push(field);
      if (field && !field.dataset.askedBy) field.dataset.askedBy = input.getAttribute("data-asked-by");
    });

    // Individual answers inside a tag question, each offered to its own headings.
    var answers = Array.prototype.slice.call(
      form.querySelectorAll(".field input[data-categories]")
    );

    function refresh() {
      var slug = slugOf(category);

      scopedFields.forEach(function (field) {
        field.hidden = !offeredTo(field, slug);
      });

      answers.forEach(function (input) {
        var option = input.closest("label") || input;
        // By the answer's own headings, not the question's. Each input carries
        // both, and `offeredTo` reads `data-asked-by` first — which would show
        // every answer wherever the question is asked, Varsity under Enrichment
        // included (#9).
        var categories = input.getAttribute("data-categories") || "";
        var shown = slug === "" || categories.split(" ").indexOf(slug) !== -1;
        option.hidden = !shown;
        if (!shown) input.checked = false;
      });

      // A question every one of whose answers has just been hidden is a question
      // with nothing to answer.
      document.querySelectorAll("[data-answer-field]").forEach(function (field) {
        var visible = field.querySelectorAll("input[data-categories]:not([hidden])");
        var anyShown = Array.prototype.some.call(visible, function (input) {
          var option = input.closest("label");
          return !option || !option.hidden;
        });
        field.hidden = !anyShown;
      });

      if (narrowTags) {
        var offered = narrowTags(slug);
        var tagField = tagSelect.closest(".field");
        // With the script, anyone can type a suggestion, so the box stays even
        // for a heading with nothing to offer (#40).
        if (tagField) tagField.hidden = !enhanced && offered === 0;
        if (tagHint) tagHint.hidden = slug !== "" && (enhanced || offered !== 0);
        if (enhanced) jq(tagSelect).trigger("change.select2");
      }

      // Last, because it reads the result of everything above: a fieldset whose
      // every question is hidden should take its legend and its hints with it.
      Array.prototype.forEach.call(form.querySelectorAll("fieldset"), function (fieldset) {
        var fields = fieldset.querySelectorAll(".field");
        if (!fields.length) return;
        var anyShown = Array.prototype.some.call(fields, function (field) {
          return !field.hidden;
        });
        fieldset.hidden = !anyShown;
      });
    }

    var pager = paginate(form, category);

    category.addEventListener("change", function () {
      refresh();
      if (pager) pager.update();
    });
    refresh();
    if (pager) pager.start();
  }

  /* ---------------------------------------------------------------------
   * One box to pick tags and suggest new ones (#40).
   *
   * Existing tags are picked as before: the heading's own show when the box
   * opens, and general ones (#25) join in once somebody types. A word that
   * isn't a tag offers "Suggest a new tag", and becomes a chip posted as
   * `new:<word>`, which the server files as a suggestion. The separate
   * Suggest a tag box is the no-script fallback, so it's hidden here and
   * anything already in it (a form sent back with an error) becomes chips.
   * ------------------------------------------------------------------- */

  function oneTagBox(form, select, jq) {
    var defaultMatcher = jq.fn.select2.defaults.defaults.matcher;

    function suggestionCount() {
      return Array.prototype.filter.call(select.options, function (option) {
        return option.selected && option.value.indexOf(NEW_TAG) === 0;
      }).length;
    }

    function existing(term) {
      var wanted = term.toLowerCase();
      return Array.prototype.some.call(select.options, function (option) {
        return option.text.trim().toLowerCase() === wanted;
      });
    }

    function addSuggestion(name) {
      var value = NEW_TAG + name;
      var already = Array.prototype.some.call(select.options, function (option) {
        return option.value.toLowerCase() === value.toLowerCase();
      });
      if (!already) select.appendChild(new Option(name, value, true, true));
    }

    var fallback = form.querySelector("input[name='suggested_tags']");
    var fallbackField = fallback ? fallback.closest(".field") : null;
    if (fallback) {
      fallback.value.split(",").forEach(function (name) {
        name = name.trim();
        if (name) addSuggestion(name);
      });
      fallback.value = "";
    }
    if (fallbackField) {
      // Its error, if the server sent one, belongs with the box people use.
      var error = fallbackField.querySelector(".field-error");
      var tagField = select.closest(".field");
      if (error && tagField) {
        tagField.insertBefore(error, tagField.firstChild);
        tagField.classList.add("has-error");
      }
      fallbackField.hidden = true;
    }

    jq(select).select2({
      width: "100%",
      placeholder: select.dataset.placeholder || "",
      closeOnSelect: false,
      tags: true,
      tokenSeparators: [","],
      // The list that opens before anyone types is the heading's own
      // suggestions. General tags (#25) join in once somebody types, so the
      // suggestions stay short and the rest are still findable.
      matcher: function (params, data) {
        var typed = params.term && params.term.trim() !== "";
        if (!typed && data.element && data.element.hasAttribute("data-general")) return null;
        return defaultMatcher(params, data);
      },
      createTag: function (params) {
        var term = (params.term || "").replace(/,/g, " ").trim();
        // A word that is already a tag is picked, not suggested twice.
        if (!term || existing(term)) return null;
        if (suggestionCount() >= MAX_SUGGESTIONS) {
          return { id: "limit", text: "You can suggest up to three tags", disabled: true };
        }
        return { id: NEW_TAG + term, text: term, newTag: true };
      },
      // After the existing tags, not before, so Enter picks "Robotics" rather
      // than suggesting "Rob".
      insertTag: function (data, tag) {
        data.push(tag);
      },
      templateResult: function (data) {
        if (data.newTag) return "Suggest a new tag: " + data.text;
        return data.text;
      },
      templateSelection: function (data) {
        var value = data.id || "";
        if (value.indexOf(NEW_TAG) === 0) return data.text + " (suggested)";
        return data.text;
      }
    });

    // The box stays open between picks, and Select2 keeps what was typed;
    // the next word would run on from the last ("RobLego"). Start it fresh.
    jq(select).on("select2:select", function () {
      var search = jq(select).data("select2").$container.find(".select2-search__field");
      search.val("").trigger("input");
    });
  }

  /* ---------------------------------------------------------------------
   * Classes offered, as chips (#34).
   *
   * The server renders a plain text box holding "Spanish I, Spanish II". This
   * puts a Select2 box in its place, one chip per class, typed freely and
   * ended with Enter or a comma. The text box stays in the form, hidden, and
   * is rewritten on every change, so what's posted is exactly what the form
   * would get without the script. Commas can't appear inside a class name,
   * since they're what separates one from the next.
   * ------------------------------------------------------------------- */

  function classList(input, jq) {
    if (!jq || typeof jq.fn.select2 !== "function") return;

    var select = document.createElement("select");
    select.multiple = true;
    // The label points at the input's id; hand it to the box people use.
    select.id = input.id;
    input.id = input.id + "_value";
    input.type = "hidden";
    input.parentNode.insertBefore(select, input);

    input.value.split(",").forEach(function (name) {
      name = name.trim();
      if (name) select.appendChild(new Option(name, name, true, true));
    });

    jq(select).select2({
      tags: true,
      tokenSeparators: [","],
      width: "100%",
      placeholder: input.dataset.placeholder || "",
      selectOnClose: true,
      // There is no list to choose from, so don't open an empty one.
      minimumInputLength: 1,
      language: {
        inputTooShort: function () {
          return "Type a class, then press Enter";
        }
      }
    });
    jq(select).on("change", function () {
      input.value = (jq(select).val() || []).join(", ");
    });

    // Whatever is still typed in the search box becomes a chip. Used when
    // Enter reached the form instead of Select2 (see the submit guard above).
    select.addTyped = function (search) {
      var name = (search.value || "").replace(/,/g, " ").trim();
      if (!name) return;
      var taken = Array.prototype.some.call(select.options, function (option) {
        return option.value.toLowerCase() === name.toLowerCase();
      });
      if (!taken) select.appendChild(new Option(name, name, true, true));
      search.value = "";
      jq(select).trigger("change");
      jq(select).select2("close");
    };
  }

  /* ---------------------------------------------------------------------
   * One page at a time (#21).
   *
   * The template groups the fieldsets into `data-form-page` sections. This
   * shows one, with Back and Next under it and a progress bar under those.
   * It's still one <form> and one POST at the end; nothing is sent between
   * pages. Without this script the sections stack and the whole form shows.
   *
   * A page whose every fieldset the narrowing above has hidden is skipped, and
   * the step count leaves it out. Next checks the page's required fields
   * first, but only the ones on screen: the server checks everything again on
   * submit, and if it finds a problem the form opens on that page.
   * ------------------------------------------------------------------- */

  function paginate(form, category) {
    var pages = Array.prototype.slice.call(form.querySelectorAll("[data-form-page]"));
    var submit = form.querySelector("[data-form-submit]");
    var submitHint = form.querySelector("[data-form-submit-hint]");
    if (pages.length < 2 || !submit) return null;

    form.classList.add("is-paged");

    // Back looks like Next, so it's as easy to find (#32).
    var back = button("← Back", "form-back");
    var next = button("Next", "form-next");
    submit.parentNode.insertBefore(back, submit);
    submit.parentNode.insertBefore(next, submit);

    var progress = document.createElement("div");
    progress.className = "form-progress";
    var status = document.createElement("p");
    status.className = "form-progress__status";
    status.setAttribute("aria-live", "polite");
    var steps = document.createElement("ol");
    steps.className = "form-progress__steps";
    steps.setAttribute("aria-label", "Progress");
    progress.appendChild(status);
    progress.appendChild(steps);
    submit.parentNode.appendChild(progress);

    pages.forEach(function (page) {
      page.setAttribute("tabindex", "-1");
      page.setAttribute("aria-label", page.dataset.title || "");
    });

    var current = pages[0];

    function button(text, className) {
      var element = document.createElement("button");
      element.type = "button";
      element.textContent = text;
      if (className) element.className = className;
      return element;
    }

    function inUse(page) {
      return Array.prototype.some.call(page.querySelectorAll("fieldset"), function (fieldset) {
        return !fieldset.hidden;
      });
    }

    function shownPages() {
      return pages.filter(inUse);
    }

    function render() {
      var shown = shownPages();
      if (shown.indexOf(current) === -1) current = shown[0] || pages[0];
      var index = shown.indexOf(current);
      var last = index === shown.length - 1;

      pages.forEach(function (page) {
        page.hidden = page !== current;
      });
      // Select2 sizes its search box when the list changes, and a list that
      // changed while its page was hidden measured zero: no placeholder, and
      // a box that looks empty. Let it measure again now it can be seen.
      var jq = window.jQuery;
      if (jq && jq.fn.select2) {
        jq(current).find("select.select2-hidden-accessible").trigger("change.select2");
      }
      back.hidden = index === 0;
      next.hidden = last;
      submit.hidden = !last;
      if (submitHint) submitHint.hidden = !last;

      status.textContent =
        "Step " + (index + 1) + " of " + shown.length + ": " + (current.dataset.title || "");
      // Finished steps are buttons back to their page (#32). Steps ahead
      // aren't, since Next checks each page's required fields on the way.
      steps.textContent = "";
      shown.forEach(function (page, position) {
        var step = document.createElement("li");
        var title = "step " + (position + 1) + ": " + (page.dataset.title || "");
        var bar;
        if (position < index) {
          step.className = "is-done";
          bar = document.createElement("button");
          bar.type = "button";
          bar.setAttribute("aria-label", "Back to " + title);
          bar.title = "Back to " + title;
          bar.addEventListener("click", function () {
            clearProblems();
            show(page, { history: true, focus: true });
          });
        } else {
          bar = document.createElement("span");
          bar.title = "Step " + title.slice(5);
          if (position === index) {
            step.className = "is-current";
            step.setAttribute("aria-current", "step");
          }
          // The status line above already reads these out.
          step.setAttribute("aria-hidden", "true");
        }
        bar.className = "form-progress__step";
        step.appendChild(bar);
        steps.appendChild(step);
      });
    }

    function show(page, options) {
      current = page;
      render();
      if (options && options.history) {
        history.pushState({ formPage: pages.indexOf(page) }, "");
      }
      if (options && options.focus) {
        current.focus({ preventScroll: true });
        current.scrollIntoView({ block: "start" });
      }
    }

    /* --- Checking a page before leaving it -------------------------------- */

    function answered(field) {
      var inputs = field.querySelectorAll("input, select, textarea");
      return Array.prototype.some.call(inputs, function (input) {
        if (input.type === "checkbox" || input.type === "radio") return input.checked;
        if (input.tagName === "SELECT") {
          return Array.prototype.some.call(input.selectedOptions, function (option) {
            return option.value !== "";
          });
        }
        return input.value.trim() !== "";
      });
    }

    function clearProblems() {
      form.querySelectorAll("[data-client-error]").forEach(function (message) {
        var field = message.closest(".field");
        if (field) field.classList.remove("has-error");
        message.remove();
      });
    }

    function flag(field, text) {
      var message = document.createElement("p");
      message.className = "field-error";
      message.setAttribute("data-client-error", "");
      message.textContent = text;
      field.insertBefore(message, field.firstChild);
      field.classList.add("has-error");
    }

    function problemsOn(page) {
      var problems = [];
      if (page.contains(category) && !category.value) {
        problems.push({
          field: category.closest(".field"),
          text: "Choose the kind of program first. The rest of the form depends on it."
        });
      }
      page.querySelectorAll(".field[data-required]").forEach(function (field) {
        if (field.hidden || field.closest("fieldset[hidden]") || field.contains(category)) return;
        if (!answered(field)) problems.push({ field: field, text: "This field is required." });
      });
      return problems;
    }

    function check(page) {
      clearProblems();
      var problems = problemsOn(page);
      problems.forEach(function (problem) {
        if (problem.field) flag(problem.field, problem.text);
      });
      if (problems.length && problems[0].field) {
        var first = problems[0].field.querySelector("input:not([type=hidden]), select, textarea");
        problems[0].field.scrollIntoView({ block: "center" });
        if (first) first.focus({ preventScroll: true });
      }
      return problems.length === 0;
    }

    function step(by) {
      var shown = shownPages();
      var target = shown[shown.indexOf(current) + by];
      if (!target) return;
      if (by > 0 && !check(current)) return;
      clearProblems();
      show(target, { history: true, focus: true });
    }

    back.addEventListener("click", function () {
      step(-1);
    });
    next.addEventListener("click", function () {
      step(1);
    });

    // Enter in a text box submits a form. Before the last page that should
    // mean Next, not sending half a registration.
    form.addEventListener("submit", function (event) {
      var shown = shownPages();
      if (current !== shown[shown.length - 1]) {
        event.preventDefault();
        step(1);
      } else if (!check(current)) {
        event.preventDefault();
      }
    });

    // The browser's Back button moves between pages rather than leaving the
    // form and losing everything typed into it.
    window.addEventListener("popstate", function (event) {
      var index = event.state && event.state.formPage;
      if (typeof index === "number" && pages[index]) show(pages[index], { focus: true });
    });

    return {
      update: render,
      start: function () {
        // A form the server sent back opens on the first page with a problem.
        var withError = pages.filter(function (page) {
          return page.querySelector(".has-error, .field-error");
        })[0];
        current = withError || pages[0];
        render();
        history.replaceState({ formPage: pages.indexOf(current) }, "");
        if (withError) withError.scrollIntoView({ block: "start" });
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
