<script lang="ts">
 // gitblog-membership-v1: public stub only; all authorization stays in GitBlog.
 import {onMount} from 'svelte';
 import {mountMembership} from '@gitblogapp/browser/membership';
 let {id,locale}:{id:string;locale?:string}=$props();
 let host:HTMLElement;
 onMount(()=>{const reader=mountMembership(host,{id,locale});return ()=>reader.destroy();});
</script>
<section class="membership-embed" data-pagefind-ignore bind:this={host}>
 <noscript>JavaScript is required to read this membership article.</noscript>
</section>
<style>.membership-embed{margin:24px 0;}</style>
