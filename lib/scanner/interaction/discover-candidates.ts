import type { Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import {
  classifyCandidateSafety,
  candidatePriority,
} from "@/lib/scanner/interaction/classify-candidate";
import type { InteractionCandidate } from "@/lib/scanner/interaction/candidate-types";
import { getUnsafeKeywordList } from "@/lib/scanner/interaction/safety-keywords";

type RawCandidate = {
  structuralSelector: string;
  tagName: string;
  inputType: string;
  role: string;
  formAssociated: boolean;
  hasHref: boolean;
  hasDownload: boolean;
  hasTarget: boolean;
  hasFormAction: boolean;
  isSubmit: boolean;
  isReset: boolean;
  isFile: boolean;
  isPassword: boolean;
  isTextEntry: boolean;
  isContentEditable: boolean;
  isSelect: boolean;
  isRange: boolean;
  isColor: boolean;
  isDateTime: boolean;
  disabled: boolean;
  ariaDisabled: boolean;
  busy: boolean;
  hidden: boolean;
  inViewport: boolean;
  visible: boolean;
  unsafeByKeyword: boolean;
  hasAriaExpanded: boolean;
  hasAriaPressed: boolean;
  hasAriaChecked: boolean;
  hasAriaControls: boolean;
  isSummary: boolean;
  isButtonTypeButton: boolean;
  isCheckbox: boolean;
  isRadio: boolean;
  isRoleButton: boolean;
  isRoleSwitch: boolean;
  isRoleCheckbox: boolean;
  renderedArea: number;
};

/**
 * Discovers main-frame interaction candidates without clicking.
 * Keyword matching runs inside the page so labels never leave the browser.
 */
export async function discoverInteractionCandidates(
  page: Page,
  config: ScannerConfig,
): Promise<{ candidates: InteractionCandidate[]; limitReached: boolean }> {
  const max = config.maxInteractionCandidates;
  const maxSelector = config.maxInteractionSelectorLength;
  const minArea = config.interactionMinVisibleAreaPx;
  const keywords = getUnsafeKeywordList();

  const evaluated = await Promise.race([
    page.evaluate(
      ({ maxElements, maxSelectorLength, minVisibleArea, unsafeKeywords }) => {
        function structuralSelector(element: Element): string {
          const parts: string[] = [];
          let current: Element | null = element;
          let depth = 0;
          while (current && depth < 6) {
            const parent: Element | null = current.parentElement;
            const tag = current.tagName.toLowerCase();
            if (!parent) {
              parts.unshift(tag);
              break;
            }
            const siblings = Array.from(parent.children).filter(
              (child) => child.tagName === current!.tagName,
            );
            const index = siblings.indexOf(current) + 1;
            parts.unshift(`${tag}:nth-of-type(${index})`);
            current = parent;
            depth += 1;
          }
          const selector = parts.join(" > ");
          return selector.length > maxSelectorLength
            ? selector.slice(0, maxSelectorLength)
            : selector;
        }

        function isVisible(el: HTMLElement): boolean {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") {
            return false;
          }
          if (style.visibility === "collapse") return false;
          if (Number(style.opacity) <= 0) return false;
          const rect = el.getBoundingClientRect();
          return rect.width * rect.height >= minVisibleArea;
        }

        function inViewport(el: HTMLElement): boolean {
          const rect = el.getBoundingClientRect();
          return (
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth
          );
        }

        const selector =
          'button, input[type="button"], input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="reset"], input[type="file"], [role="button"], [role="switch"], [role="checkbox"], summary, a[href]';
        const nodes = Array.from(document.querySelectorAll(selector));
        const limitReached = nodes.length > maxElements;
        const slice = nodes.slice(0, maxElements);
        const results: RawCandidate[] = [];

        for (const node of slice) {
          const el = node as HTMLElement;
          const tagName = el.tagName.toLowerCase();
          const inputType = (
            (el as HTMLInputElement).type ||
            el.getAttribute("type") ||
            ""
          ).toLowerCase();
          const role = (el.getAttribute("role") || "").toLowerCase();
          const formAssociated = Boolean(
            (el as HTMLButtonElement).form || el.closest("form"),
          );
          const labelSource = [
            el.getAttribute("aria-label") || "",
            el.textContent || "",
          ]
            .join(" ")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
          let unsafeByKeyword = false;
          for (const keyword of unsafeKeywords) {
            const key = keyword.trim();
            if (!key) continue;
            if (labelSource.includes(key)) {
              unsafeByKeyword = true;
              break;
            }
          }

          const rect = el.getBoundingClientRect();
          const visible = isVisible(el);
          results.push({
            structuralSelector: structuralSelector(el),
            tagName,
            inputType,
            role,
            formAssociated,
            hasHref: el.hasAttribute("href"),
            hasDownload: el.hasAttribute("download"),
            hasTarget: el.hasAttribute("target"),
            hasFormAction: el.hasAttribute("formaction"),
            isSubmit:
              inputType === "submit" ||
              (tagName === "button" &&
                (inputType === "submit" || inputType === "") &&
                formAssociated),
            isReset: inputType === "reset",
            isFile: inputType === "file",
            isPassword: inputType === "password",
            isTextEntry: [
              "text",
              "email",
              "search",
              "tel",
              "url",
              "number",
            ].includes(inputType),
            isContentEditable: el.isContentEditable,
            isSelect: tagName === "select",
            isRange: inputType === "range",
            isColor: inputType === "color",
            isDateTime: [
              "date",
              "time",
              "datetime-local",
              "month",
              "week",
            ].includes(inputType),
            disabled: Boolean((el as HTMLButtonElement).disabled),
            ariaDisabled: el.getAttribute("aria-disabled") === "true",
            busy: el.getAttribute("aria-busy") === "true",
            hidden: !visible,
            inViewport: visible && inViewport(el),
            visible,
            unsafeByKeyword,
            hasAriaExpanded: el.hasAttribute("aria-expanded"),
            hasAriaPressed: el.hasAttribute("aria-pressed"),
            hasAriaChecked: el.hasAttribute("aria-checked"),
            hasAriaControls: el.hasAttribute("aria-controls"),
            isSummary: tagName === "summary",
            isButtonTypeButton:
              (tagName === "button" && inputType === "button") ||
              (tagName === "input" && inputType === "button"),
            isCheckbox:
              (tagName === "input" && inputType === "checkbox") ||
              role === "checkbox",
            isRadio: tagName === "input" && inputType === "radio",
            isRoleButton: role === "button",
            isRoleSwitch: role === "switch",
            isRoleCheckbox: role === "checkbox",
            renderedArea: Math.max(0, rect.width * rect.height),
          });
        }

        return { results, limitReached };
      },
      {
        maxElements: max,
        maxSelectorLength: maxSelector,
        minVisibleArea: minArea,
        unsafeKeywords: keywords,
      },
    ),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("INTERACTION_DISCOVERY_TIMEOUT")),
        config.interactionDiscoveryTimeoutMs,
      );
    }),
  ]);

  const candidates: InteractionCandidate[] = evaluated.results.map((raw) => {
    const classification = classifyCandidateSafety(raw);
    const priority = candidatePriority(raw);
    return {
      fingerprint: {
        structuralSelector: raw.structuralSelector,
        tagName: raw.tagName,
        inputType: raw.inputType,
        role: raw.role,
        formAssociated: raw.formAssociated,
        hasAriaExpanded: raw.hasAriaExpanded,
        hasAriaPressed: raw.hasAriaPressed,
        hasAriaChecked: raw.hasAriaChecked,
        hasAriaControls: raw.hasAriaControls,
        priority,
      },
      classification,
      inViewport: raw.inViewport,
      visible: raw.visible,
      disabled: raw.disabled,
      ariaDisabled: raw.ariaDisabled,
      unsafeByKeyword: raw.unsafeByKeyword,
    };
  });

  candidates.sort((a, b) => {
    if (a.fingerprint.priority !== b.fingerprint.priority) {
      return a.fingerprint.priority - b.fingerprint.priority;
    }
    return a.fingerprint.structuralSelector.localeCompare(
      b.fingerprint.structuralSelector,
    );
  });

  return { candidates, limitReached: evaluated.limitReached };
}
