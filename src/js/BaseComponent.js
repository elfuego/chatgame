/**
 * Use BaseComponent to extend new web components from.
 *
 * @export
 * @class
 * @extends {HTMLElement}
 */
export default class extends HTMLElement {
	constructor(template, style) {
		super();
		this.setTemplate(template, style);
	}

	setTemplate(template, style = '') {
		if (this.shadowRoot) {
			this.shadowRoot.innerHTML = '';
		}

		this.templateContent = template;

		// dart-sass sometimes prepends a BOM to the output.
		// That breaks the first CSS rule inside the shadow DOM, so strip it.
		this.styleContent = String(style).replace(/^\uFEFF/, '');
	}

	connectedCallback() {
		this.render();
	}

	// Shorthand for querying inside the shadow root.
	$(selector) {
		return this.shadowRoot.querySelector(selector);
	}

	beforeRender() {
		// Does nothing by default, but can be overridden where needed,
		// for example to placeholderize certain components before they're shown.
	}

	render() {
		if (!this.shadowRoot) {
			this.attachShadow({ mode: 'open' });
		}

		this.beforeRender();

		const template = document.createElement('template');
		template.innerHTML = `<style>${this.styleContent}</style> ${this.templateContent}`;
		// Replace instead of append, so calling render() again doesn't duplicate the UI.
		this.shadowRoot.replaceChildren(template.content.cloneNode(true));
		this.hidden = false;
	}

	// Unhides the component after load to prevent layout shift (it's hidden by default with CSS).
	unhide() {
		if (this.hasAttribute('data-webcomponent-hidden')) {
			this.removeAttribute('data-webcomponent-hidden');
		}
	}

	getSlotContent(hostElement, slotName = null, nodeProcessor) {
		if (!hostElement || !hostElement.shadowRoot) {
			return '';
		}

		const selector = slotName ? `slot[name="${slotName}"]` : 'slot';
		const slot = hostElement.shadowRoot.querySelector(selector);
		if (!slot) {
			return '';
		}

		const assignedNodes = slot.assignedNodes({ flatten: true });
		let result = '';

		assignedNodes.forEach((node) => {
			result += nodeProcessor(node);
		});

		return result.trim();
	}

	getSlotContentAsText(hostElement, slotName = null) {
		return this.getSlotContent(hostElement, slotName, (node) => {
			if (node.nodeType === Node.ELEMENT_NODE) {
				return node.textContent.trim() + ' ';
			} else if (node.nodeType === Node.TEXT_NODE) {
				return node.textContent.trim() + ' ';
			}

			return '';
		});
	}

	getSlotContentAsHTML(hostElement, slotName = null) {
		return this.getSlotContent(hostElement, slotName, (node) => {
			if (node.nodeType === Node.ELEMENT_NODE) {
				return node.outerHTML;
			} else if (node.nodeType === Node.TEXT_NODE) {
				return node.textContent;
			}

			return '';
		});
	}

	/**
	 * Helper function to reset the css of a slot.
	 *
	 * @param {*} slotName to reset just one specific slot
	 */
	resetSlotStyle(slotName) {
		const selector = slotName ? `slot[name="${slotName}"]` : 'slot';

		this.shadowRoot.querySelectorAll(selector).forEach((slot) => {
			slot.assignedNodes({ flatten: true }).forEach((node) => {
				if (node.nodeType === Node.ELEMENT_NODE) {
					node.className = 'reset-css';
				}
			});
		});
	}
}
