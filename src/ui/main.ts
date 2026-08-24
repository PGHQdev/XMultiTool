import { mount } from 'svelte'
import App from './App.svelte'
import '../core/ui/tokens.css'

mount(App, { target: document.getElementById('app') as HTMLElement })
