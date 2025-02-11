// app/routes/logout.tsx
import type { LoaderFunction } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { getSession, destroySession } from '~/session.server';

export const loader: LoaderFunction = async ({ request }) => {
  // Obtém a sessão atual a partir dos cookies da requisição
  const session = await getSession(request.headers.get('Cookie'));

  // Destroi a sessão atual
  return redirect('/login', {
    headers: {
      'Set-Cookie': await destroySession(session),
    },
  });
};

export default function Logout() {
  // Essa rota realiza o logout automaticamente via loader, 
  // mas se desejar pode renderizar algo (ex: "Logging out...").
  return <p>Desconectando...</p>;
}
