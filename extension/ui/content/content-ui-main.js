/*
 * Copyright 2010-2020 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or 
 *   modify it under the terms of the GNU Affero General Public License 
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 * 
 *   The code in this file is distributed in the hope that it will be useful, 
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of 
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero 
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may 
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU 
 *   AGPL normally required by section 4, provided you include this license 
 *   notice and a URL through which recipients can access the Corresponding 
 *   Source.
 */

/* global browser, document, getComputedStyle, addEventListener, removeEventListener, requestAnimationFrame, setTimeout, getSelection, Node */

this.screenbreak.extension.ui.content.main = this.screenbreak.extension.ui.content.main || (() => {

	const SELECTED_CONTENT_ATTRIBUTE_NAME = this.singlefile.lib.helper.SELECTED_CONTENT_ATTRIBUTE_NAME;

	const LOADING_PAGE_URL = "/extension/ui/overlay/loading.html";
	const ERROR_PAGE_URL = "/extension/ui/overlay/error.html";
	const SUCCESS_PAGE_URL = "/extension/ui/overlay/success.html";

	const SINGLE_FILE_UI_ELEMENT_CLASS = "single-file-ui-element";
	const SELECTION_ZONE_TAGNAME = "screenbreak-selection-zone";
	const OVERLAY_TAGNAME = "screenbreak-overlay";
	const SELECT_PX_THRESHOLD = 8;

	let selectedAreaElement;

	let overlayIframeElement, overlayElement;
	const allProperties = new Set();
	Array.from(getComputedStyle(document.body)).forEach(property => allProperties.add(property));

	return {
		markSelection,
		unmarkSelection,
		onStartPage() {
			createOverlayElement();
			setOverlayStyle();
			document.body.appendChild(overlayElement);
		},
		onError(error, details) {
			overlayIframeElement.src = browser.runtime.getURL(ERROR_PAGE_URL + "?" + JSON.stringify({ error, details }));
		},
		onUploadProgress(index, maxIndex) {
			overlayIframeElement.contentWindow.postMessage(JSON.stringify({ method: "screenbreak.uploadProgress", index, maxIndex }), "*");
		},
		onUploadEnd() {
			overlayIframeElement.src = browser.runtime.getURL(SUCCESS_PAGE_URL);
		},
		onLoadResource(index, maxIndex) {
			overlayIframeElement.contentWindow.postMessage(JSON.stringify({ method: "screenbreak.saveProgress", index, maxIndex }), "*");
		},
		onCancelled() {
			overlayElement.remove();
		}
	};

	async function markSelection(optionallySelected) {
		let selectionFound = markSelectedContent();
		if (selectionFound || optionallySelected) {
			return selectionFound;
		} else {
			selectionFound = await selectArea();
			if (selectionFound) {
				return markSelectedContent();
			}
		}
	}

	function markSelectedContent() {
		const selection = getSelection();
		let selectionFound;
		for (let indexRange = 0; indexRange < selection.rangeCount; indexRange++) {
			let range = selection.getRangeAt(indexRange);
			if (range && range.commonAncestorContainer) {
				const treeWalker = document.createTreeWalker(range.commonAncestorContainer);
				let rangeSelectionFound = false;
				let finished = false;
				while (!finished) {
					if (rangeSelectionFound || treeWalker.currentNode == range.startContainer || treeWalker.currentNode == range.endContainer) {
						rangeSelectionFound = true;
						if (range.startContainer != range.endContainer || range.startOffset != range.endOffset) {
							selectionFound = true;
							markSelectedNode(treeWalker.currentNode);
						}
					}
					if (selectionFound && treeWalker.currentNode == range.startContainer) {
						markSelectedParents(treeWalker.currentNode);
					}
					if (treeWalker.currentNode == range.endContainer) {
						finished = true;
					} else {
						treeWalker.nextNode();
					}
				}
				if (selectionFound && treeWalker.currentNode == range.endContainer && treeWalker.currentNode.querySelectorAll) {
					treeWalker.currentNode.querySelectorAll("*").forEach(descendantElement => markSelectedNode(descendantElement));
				}
			}
		}
		return selectionFound;
	}

	function markSelectedNode(node) {
		const element = node.nodeType == Node.ELEMENT_NODE ? node : node.parentElement;
		element.setAttribute(SELECTED_CONTENT_ATTRIBUTE_NAME, "");
	}

	function markSelectedParents(node) {
		if (node.parentElement) {
			markSelectedNode(node);
			markSelectedParents(node.parentElement);
		}
	}

	function unmarkSelection() {
		document.querySelectorAll("[" + SELECTED_CONTENT_ATTRIBUTE_NAME + "]").forEach(selectedContent => selectedContent.removeAttribute(SELECTED_CONTENT_ATTRIBUTE_NAME));
	}

	function selectArea() {
		return new Promise(resolve => {
			let selectedRanges = [];
			addEventListener("mousemove", mousemoveListener, true);
			addEventListener("click", clickListener, true);
			addEventListener("keyup", keypressListener, true);
			document.addEventListener("contextmenu", contextmenuListener, true);
			getSelection().removeAllRanges();

			function contextmenuListener(event) {
				selectedRanges = [];
				select();
				event.preventDefault();
			}

			function mousemoveListener(event) {
				const targetElement = getTarget(event);
				if (targetElement) {
					selectedAreaElement = targetElement;
					moveAreaSelector(targetElement);
				}
			}

			function clickListener(event) {
				event.preventDefault();
				event.stopPropagation();
				if (event.button == 0) {
					select(selectedAreaElement, event.ctrlKey);
				} else {
					cancel();
				}
			}

			function keypressListener(event) {
				if (event.key == "Escape") {
					cancel();
				}
			}

			function cancel() {
				if (selectedRanges.length) {
					getSelection().removeAllRanges();
				}
				selectedRanges = [];
				cleanupAndResolve();
			}

			function select(selectedElement, multiSelect) {
				if (selectedElement) {
					if (!multiSelect) {
						restoreSelectedRanges();
					}
					const range = document.createRange();
					range.selectNodeContents(selectedElement);
					cleanupSelectionRanges();
					getSelection().addRange(range);
					saveSelectedRanges();
					if (!multiSelect) {
						cleanupAndResolve();
					}
				} else {
					cleanupAndResolve();
				}
			}

			function cleanupSelectionRanges() {
				const selection = getSelection();
				for (let indexRange = selection.rangeCount - 1; indexRange >= 0; indexRange--) {
					const range = selection.getRangeAt(indexRange);
					if (range.startOffset == range.endOffset) {
						selection.removeRange(range);
						indexRange--;
					}
				}
			}

			function cleanupAndResolve() {
				getAreaSelector().remove();
				removeEventListener("mousemove", mousemoveListener, true);
				removeEventListener("click", clickListener, true);
				removeEventListener("keyup", keypressListener, true);
				selectedAreaElement = null;
				resolve(Boolean(selectedRanges.length));
				setTimeout(() => document.removeEventListener("contextmenu", contextmenuListener, true), 0);
			}

			function restoreSelectedRanges() {
				getSelection().removeAllRanges();
				selectedRanges.forEach(range => getSelection().addRange(range));
			}

			function saveSelectedRanges() {
				selectedRanges = [];
				for (let indexRange = 0; indexRange < getSelection().rangeCount; indexRange++) {
					const range = getSelection().getRangeAt(indexRange);
					selectedRanges.push(range);
				}
			}
		});
	}

	function getTarget(event) {
		let newTarget, target = event.target, boundingRect = target.getBoundingClientRect();
		newTarget = determineTargetElement("floor", target, event.clientX - boundingRect.left, getMatchedParents(target, "left"));
		if (newTarget == target) {
			newTarget = determineTargetElement("ceil", target, boundingRect.left + boundingRect.width - event.clientX, getMatchedParents(target, "right"));
		}
		if (newTarget == target) {
			newTarget = determineTargetElement("floor", target, event.clientY - boundingRect.top, getMatchedParents(target, "top"));
		}
		if (newTarget == target) {
			newTarget = determineTargetElement("ceil", target, boundingRect.top + boundingRect.height - event.clientY, getMatchedParents(target, "bottom"));
		}
		target = newTarget;
		while (target && target.clientWidth <= SELECT_PX_THRESHOLD && target.clientHeight <= SELECT_PX_THRESHOLD) {
			target = target.parentElement;
		}
		return target;
	}

	function moveAreaSelector(target) {
		requestAnimationFrame(() => {
			const selectorElement = getAreaSelector();
			const boundingRect = target.getBoundingClientRect();
			const scrollingElement = document.scrollingElement || document.documentElement;
			selectorElement.style.setProperty("top", (scrollingElement.scrollTop + boundingRect.top - 10) + "px");
			selectorElement.style.setProperty("left", (scrollingElement.scrollLeft + boundingRect.left - 10) + "px");
			selectorElement.style.setProperty("width", (boundingRect.width + 20) + "px");
			selectorElement.style.setProperty("height", (boundingRect.height + 20) + "px");
		});
	}

	function getAreaSelector() {
		let selectorElement = document.querySelector(SELECTION_ZONE_TAGNAME);
		if (!selectorElement) {
			selectorElement = createElement(SELECTION_ZONE_TAGNAME, document.body);
			selectorElement.style.setProperty("box-sizing", "border-box", "important");
			selectorElement.style.setProperty("background-color", "#3ea9d7", "important");
			selectorElement.style.setProperty("border", "10px solid #0b4892", "important");
			selectorElement.style.setProperty("border-radius", "2px", "important");
			selectorElement.style.setProperty("opacity", ".25", "important");
			selectorElement.style.setProperty("pointer-events", "none", "important");
			selectorElement.style.setProperty("position", "absolute", "important");
			selectorElement.style.setProperty("transition", "all 100ms", "important");
			selectorElement.style.setProperty("cursor", "pointer", "important");
			selectorElement.style.setProperty("z-index", "2147483647", "important");
			selectorElement.style.removeProperty("border-inline-end");
			selectorElement.style.removeProperty("border-inline-start");
			selectorElement.style.removeProperty("inline-size");
			selectorElement.style.removeProperty("block-size");
			selectorElement.style.removeProperty("inset-block-start");
			selectorElement.style.removeProperty("inset-inline-end");
			selectorElement.style.removeProperty("inset-block-end");
			selectorElement.style.removeProperty("inset-inline-start");
		}
		return selectorElement;
	}

	function createOverlayElement() {
		overlayElement = document.createElement(OVERLAY_TAGNAME);
		overlayElement.className = SINGLE_FILE_UI_ELEMENT_CLASS;
	}

	function setOverlayStyle() {
		initStyle(overlayElement);
		overlayElement.style.setProperty("position", "fixed", "important");
		overlayElement.style.setProperty("z-index", 2147483647, "important");
		overlayElement.style.setProperty("background-color", "transparent", "important");
		overlayElement.style.setProperty("top", "50%", "important");
		overlayElement.style.setProperty("left", "50%", "important");
		overlayElement.style.setProperty("margin-right", "-50%;", "important");
		overlayElement.style.setProperty("transform", "translate(-50%, -50%)", "important");
		overlayElement.style.setProperty("width", "100%", "important");
		overlayElement.style.setProperty("height", "100%", "important");
		overlayElement.style.setProperty("overflow", "hidden", "important");
		overlayIframeElement = document.createElement("iframe");
		initStyle(overlayIframeElement);
		overlayIframeElement.style.setProperty("width", "100%", "important");
		overlayIframeElement.style.setProperty("height", "100%", "important");
		overlayIframeElement.style.setProperty("background-color", "transparent", "important");
		overlayIframeElement.style.setProperty("overflow", "hidden", "important");
		overlayElement.appendChild(overlayIframeElement);
		overlayIframeElement.src = browser.runtime.getURL(LOADING_PAGE_URL);
	}

	function getMatchedParents(target, property) {
		let element = target, matchedParent, parents = [];
		do {
			const boundingRect = element.getBoundingClientRect();
			if (element.parentElement) {
				const parentBoundingRect = element.parentElement.getBoundingClientRect();
				matchedParent = Math.abs(parentBoundingRect[property] - boundingRect[property]) <= SELECT_PX_THRESHOLD;
				if (matchedParent) {
					if (element.parentElement.clientWidth > SELECT_PX_THRESHOLD && element.parentElement.clientHeight > SELECT_PX_THRESHOLD &&
						((element.parentElement.clientWidth - element.clientWidth > SELECT_PX_THRESHOLD) || (element.parentElement.clientHeight - element.clientHeight > SELECT_PX_THRESHOLD))) {
						parents.push(element.parentElement);
					}
					element = element.parentElement;
				}
			} else {
				matchedParent = false;
			}
		} while (matchedParent && element);
		return parents;
	}

	function determineTargetElement(roundingMethod, target, widthDistance, parents) {
		if (Math[roundingMethod](widthDistance / SELECT_PX_THRESHOLD) <= parents.length) {
			target = parents[parents.length - Math[roundingMethod](widthDistance / SELECT_PX_THRESHOLD) - 1];
		}
		return target;
	}

	function createElement(tagName, parentElement) {
		const element = document.createElement(tagName);
		element.className = SINGLE_FILE_UI_ELEMENT_CLASS;
		if (parentElement) {
			parentElement.appendChild(element);
		}
		initStyle(element);
		return element;
	}

	function initStyle(element) {
		allProperties.forEach(property => element.style.setProperty(property, "initial", "important"));
	}

})();
