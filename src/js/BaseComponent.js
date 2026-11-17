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

	setTemplate(template, style) {
		if (this.shadowRoot) {
			this.shadowRoot.innerHTML = '';
		}

		this.templateContent = template;

		// dart-sass sometimes prepends a BOM to the output.
		// That breaks the first CSS rule inside the shadow DOM, so strip it.
		this.styleContent = style.replace(/^\uFEFF/, '');
	}

	beforeRender() {
		// Does nothing by default, but can be overridden where needed,
		// for example to placeholderize certain components before they're shown.
	}

	render() {
		if (!this.shadowDOM) {
			this.shadowDOM = this.attachShadow({ mode: 'open' });
		}

		this.beforeRender();

		const template = document.createElement('template');
		template.innerHTML = `<style>${this.styleContent}</style> ${this.templateContent}`;
		this.shadowRoot.appendChild(template.content.cloneNode(true));
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
		const resetCss = (slot) => {
			slot.assignedNodes({ flatten: true }).forEach((node) => {
				node.className = 'reset-css';
			});
		};

		const resetAllSlots = () => {
			const slots = this.shadowRoot.querySelectorAll('slot');
			slots.forEach((slot) => {
				slot.assignedNodes({ flatten: true }).forEach(() => {
					resetCss(slot);
				});
			});
		};

		const resetSingleSlot = (name) => {
			const slot = this.shadowRoot.querySelector(
				`slot[name=${name}]`
			);
			resetCss(slot);
		};

		if (slotName) {
			resetSingleSlot(slotName);
			return;
		}

		resetAllSlots();
	}
}
