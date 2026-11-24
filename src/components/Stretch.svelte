<script lang="ts">
  // Something is under way: three tasks' bars taking turns to stretch, as the day does.
</script>

<span class="st" aria-hidden="true"><i></i><i></i><i></i></span>

<style>
  .st {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 18px;
  }
  i {
    width: 4px;
    height: 16px;
    border-radius: var(--r-bar);
    background: currentColor;
    transform: scaleY(0.4);
    animation: stretch 1s ease-in-out infinite;
  }
  i:nth-child(2) {
    animation-delay: 140ms;
  }
  i:nth-child(3) {
    animation-delay: 280ms;
  }
  @keyframes stretch {
    0%,
    60%,
    100% {
      transform: scaleY(0.4);
    }
    30% {
      transform: scaleY(1.1);
    }
  }
  @keyframes dim {
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    i {
      transform: none;
      animation-name: dim;
    }
  }
</style>
