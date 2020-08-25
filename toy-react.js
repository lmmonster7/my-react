
const RENDER_TO_DOM = Symbol("render to dom")

export class Component {
  constructor(content) {
    this.props = Object.create(null)
    this.children = []
    this._root = null
  }
  // 组件的属性处理，对于组件，属性是参数
  setAttribute(name, value) {
    this.props[name] = value
  }
  // 组件的子标签处理，对于组件，其子标签和原生子标签不同，不是简单的直接插入，而是需要指定位置
  appendChild(component) {
    this.children.push(component)
  }
  get vdom() {
    return this.render().vdom
  }
  [RENDER_TO_DOM](range) {
    this._range = range
    this._vdom = this.vdom
    this._vdom[RENDER_TO_DOM](range)
  }
  update() {
    let isSameNode = (oldNode, newNode) => {
      if (oldNode.type !== newNode.type)
        return false
      for (let name in newNode.props) {
        if (newNode.props[name] !== oldNode.props[name]) {
          return false
        }
      }
      if (Object.keys(oldNode.props).length > Object.keys(newNode.props).length)
        return false
      if (newNode.type === '#text') {
        if(newNode.content !== oldNode.content) {
          return false
        }
      }
      return true
    }
    let update = (oldNode, newNode) => {
      // types, props, children
      // #text content
      if (!isSameNode(oldNode, newNode)) {
        newNode[RENDER_TO_DOM](oldNode._range)
        return
      }
      oldNode._range = newNode._range

      let newChildren = newNode.vchildren
      let oldChildren = oldNode.vchildren

      if (!newChildren || !newChildren.length) {
        return
      }

      let tailRange = oldChildren[oldChildren.length - 1]._range

      for (let i = 0; i < newChildren.length; i ++) {
        let newChild = newChildren[i]
        let oldChild = oldChildren[i]
        if (i < oldChildren.length) {
          update(oldChild, newChild)
        } else {
          let range = document.createRange()
          range.setStart(tailRange.endContainer, tailRange.endOffset)
          range.setEnd(tailRange.endContainer, tailRange.endOffset)
          newChild[RENDER_TO_DOM](range)
          tailRange = range
        }
      } 
    }
    let vdom = this.vdom
    update(this._vdom, vdom)
    this._vdom = vdom
  }
  /*rerender() {
    let oldRange = this._range
    
    let range = document.createRange()
    range.setStart(oldRange.startContainer, oldRange.startOffset)
    range.setEnd(oldRange.startContainer, oldRange.startOffset)
    this[RENDER_TO_DOM](range)

    oldRange.setStart(range.endContainer, range.endOffset)
    oldRange.deleteContents()
  }*/
  setState(newState) {
    if (this.state === null || typeof this.state !== 'object') {
      this.state = newState
      this.update()
      return
    }
    let merge =  (oldState, newState) => {
      for (let p in newState) {
        if (oldState[p] === null || typeof oldState[p] !== 'object') {
          oldState[p] = newState[p]
        } else {
          merge(oldState[p], newState[p])
        }
      }
    }
    merge(this.state, newState)
    this.update()
  }
}
// 这三个包装类的共同特性，都是自定义dom对象，读取其root属性返回真实dom
class ElementWrapper extends Component {
  constructor(type) {
    super(type)
    this.type = type
    this.root = document.createElement(type)
  }
  /*
  // 原生标签的属性直接当成原生属性进行添加
  setAttribute(name, value) {
    if (name.match(/^on([\s\S]+)$/)) {
      this.root.addEventListener(RegExp.$1.replace(/^[\s\S]/, c => c.toLowerCase()), value)
    } else {
      if (name === 'className') {
        this.root.setAttribute('class', value)
      } else {
        this.root.setAttribute(name, value)
      }
    }
  }
  // 原生标签的子标签直接使用原生appendChild添加
  appendChild(component) {
    let range = document.createRange()
    range.setStart(this.root, this.root.childNodes.length)
    range.setEnd(this.root, this.root.childNodes.length)
    component[RENDER_TO_DOM](range)
  }
  */
  get vdom() {
    this.vchildren = this.children.map(child => child.vdom)
    return this
    /*return {
      type: this.type,
      props: this.props,
      children: this.children.map(child => child.vdom)
    }*/
  }
  [RENDER_TO_DOM](range) {
    this._range = range

    let root = document.createElement(this.type)

    for (let name in this.props) {
      let value = this.props[name]
      if (name.match(/^on([\s\S]+)$/)) {
        root.addEventListener(RegExp.$1.replace(/^[\s\S]/, c => c.toLowerCase()), value)
      } else {
        if (name === 'className') {
          root.setAttribute('class', value)
        } else {
          root.setAttribute(name, value)
        }
      }
    }

    if (!this.vchildren)
      this.vchildren = this.children.map(child => child.vdom)

    for (let child of this.vchildren) {
      let childRange = document.createRange()
      childRange.setStart(root, root.childNodes.length)
      childRange.setEnd(root, root.childNodes.length)
      child[RENDER_TO_DOM](childRange)
    }
    replaceContent(range, root)
  }
}

class TextWrapper extends Component {
  constructor(content) {
    super(content)
    this.type = '#text'
    this.content = content
  }
  get vdom() {
    return this
    /*return {
      type: '#text',
      content: this.content
    }*/
  }
  [RENDER_TO_DOM](range) {
    this._range = range
    let root = document.createTextNode(this.content)
    replaceContent(range, root)
  }
}

function replaceContent(range, node) {
  range.insertNode(node)
  range.setStartAfter(node)
  range.deleteContents()
  range.setStartBefore(node)
  range.setEndAfter(node)
}

// createElement的作用是返回解释好的自定义dom对象，其root属性就是我们需要的真实dom，有了真实dom对象，就可以直接挂载让浏览器进行dom渲染
// @babel/plugin-transform-react-jsx 会将js里面的dom标签转化为createElement的函数调用
// 其中 children 数组里面的子元素是是对子标签进行createElement
export function createElement(type, attributes, ...children) {
  // 这个是自定义的dom对象而非真实dom，其root是真实dom对象
  let e
  // 第一个参数
  // 第一层标签处理
  // 当标签为原生标签，eg div span等，createElement的type会传入该标签的字符串
  if (typeof type === 'string') {
    e = new ElementWrapper(type)
  } else {
  // 当标签是非原生标签，即组件的时候，传入的是一个类，这个类需要提前定义好，这个时候需要进行new
    e = new type
  }
  // 第二个参数的处理
  // 第二个参数是一个对象，用于存放给标签设定的属性
  for (let p in attributes) {
    e.setAttribute(p, attributes[p])
  }
  // 第三个参数处理
  // 该标签下面的子标签，是一个数组
  let insertChildren = (children) => {
    for (let child of children) {
      if (typeof child === 'string') {
        child = new TextWrapper(child)
      }
      if (child === null) {
        continue
      }
      // 处理传入的是一个数组的情况，因为 { this.children } this.children指向的是一个数组
      if ((typeof child === 'object') && (child instanceof Array)) {
        insertChildren(child)
      } else {
        e.appendChild(child)
      }
    }
  }
  insertChildren(children)
  // 返回自定义dom对象
  return e
}

// 该函数的功能是将dom元素挂载到html上
export function render(component, parentElement) {
  let range = document.createRange()
  range.setStart(parentElement, 0)
  range.setEnd(parentElement, parentElement.childNodes.length)
  range.deleteContents()
  component[RENDER_TO_DOM](range)
}
