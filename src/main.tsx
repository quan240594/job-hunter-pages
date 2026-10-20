import { bootstrap } from './bootstrap';
import './styles/app.css';

bootstrap(document.getElementById('root'), import.meta.env).catch((error: unknown) => {
  console.error(error);
});
