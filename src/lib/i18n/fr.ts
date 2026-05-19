import type { Dictionary } from './types.ts';

const fr: Dictionary = {
    toc: {
        label: 'Sommaire',
    },
    footer: {
        affiliateDisclosure: {
            body: 'Certains liens de ce site sont {link} : un achat via ces liens peut nous verser une commission, sans coût supplémentaire pour vous.',
            linkText: 'affiliés',
        },
    },
    byline: {
        prefix: 'Par',
        separator: ', ',
        conjunction: 'et',
    },
    author: {
        aboutLabel: 'À propos de l\'auteur',
        profileLabel: 'À propos',
        seeProfile: 'Voir le profil',
        featuredLabel: 'À la une',
        latestLabel: 'Articles récents',
    },
    routes: {
        authorsPrefix: 'auteurs',
    },
    notFound: {
        title: 'Page introuvable',
        body: "Désolé, nous n'avons pas trouvé la page que vous cherchiez. Elle a peut-être été déplacée, ou l'adresse contient peut-être une faute de frappe.",
        cta: "Retour à l'accueil",
    },
};

export default fr;
